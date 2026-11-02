//! Build-only coverage analysis. Parse test-only items without executing source.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, io::Read};
use syn::{
    parse::Parser, punctuated::Punctuated, spanned::Spanned, visit::Visit, Attribute, Item, Meta,
    Token,
};

#[derive(Deserialize)]
struct Source {
    path: String,
    source: String,
}
#[derive(Default, Serialize)]
struct Exclusions {
    ranges: BTreeMap<String, Vec<[usize; 2]>>,
    files: Vec<String>,
}
struct Visitor<'a> {
    path: &'a str,
    result: &'a mut Exclusions,
}

fn requires_test(meta: &Meta) -> bool {
    match meta {
        Meta::Path(path) => path.is_ident("test"),
        Meta::List(list) => {
            let Ok(parts) =
                Punctuated::<Meta, Token![,]>::parse_terminated.parse2(list.tokens.clone())
            else {
                return false;
            };
            if list.path.is_ident("all") {
                parts.iter().any(requires_test)
            } else if list.path.is_ident("any") {
                !parts.is_empty() && parts.iter().all(requires_test)
            } else {
                false
            }
        }
        _ => false,
    }
}
fn test_only(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|attr| {
        attr.path()
            .segments
            .last()
            .is_some_and(|s| s.ident == "test")
            || (attr.path().is_ident("cfg")
                && attr.parse_args::<Meta>().is_ok_and(|m| requires_test(&m)))
    })
}
fn external_test_file(source: &str, module: &syn::ItemMod) -> Option<String> {
    if module.content.is_some() {
        return None;
    }
    let path = module.attrs.iter().find_map(|attr| {
        let Meta::NameValue(value) = &attr.meta else {
            return None;
        };
        if !value.path.is_ident("path") {
            return None;
        }
        let syn::Expr::Lit(expr) = &value.value else {
            return None;
        };
        let syn::Lit::Str(path) = &expr.lit else {
            return None;
        };
        Some(path.value())
    })?;
    let parent = std::path::Path::new(source).parent()?;
    Some(parent.join(path).to_string_lossy().replace('\\', "/"))
}
impl Visitor<'_> {
    fn exclude(&mut self, node: &impl Spanned, attrs: &[Attribute]) -> bool {
        if !test_only(attrs) {
            return false;
        }
        let span = node.span();
        self.result
            .ranges
            .entry(self.path.to_owned())
            .or_default()
            .push([span.start().line, span.end().line]);
        true
    }
}
impl<'ast> Visit<'ast> for Visitor<'_> {
    fn visit_item(&mut self, item: &'ast Item) {
        let attrs = match item {
            Item::Const(n) => &n.attrs,
            Item::Enum(n) => &n.attrs,
            Item::ExternCrate(n) => &n.attrs,
            Item::Fn(n) => &n.attrs,
            Item::ForeignMod(n) => &n.attrs,
            Item::Impl(n) => &n.attrs,
            Item::Macro(n) => &n.attrs,
            Item::Mod(n) => &n.attrs,
            Item::Static(n) => &n.attrs,
            Item::Struct(n) => &n.attrs,
            Item::Trait(n) => &n.attrs,
            Item::TraitAlias(n) => &n.attrs,
            Item::Type(n) => &n.attrs,
            Item::Union(n) => &n.attrs,
            Item::Use(n) => &n.attrs,
            _ => {
                syn::visit::visit_item(self, item);
                return;
            }
        };
        if !self.exclude(item, attrs) {
            syn::visit::visit_item(self, item);
        } else if let Item::Mod(module) = item {
            if let Some(path) = external_test_file(self.path, module) {
                self.result.files.push(path);
            }
        }
    }
    fn visit_impl_item_fn(&mut self, item: &'ast syn::ImplItemFn) {
        if !self.exclude(item, &item.attrs) {
            syn::visit::visit_impl_item_fn(self, item);
        }
    }
    fn visit_trait_item_fn(&mut self, item: &'ast syn::TraitItemFn) {
        if !self.exclude(item, &item.attrs) {
            syn::visit::visit_trait_item_fn(self, item);
        }
    }
    fn visit_field(&mut self, item: &'ast syn::Field) {
        if !self.exclude(item, &item.attrs) {
            syn::visit::visit_field(self, item);
        }
    }
    fn visit_variant(&mut self, item: &'ast syn::Variant) {
        if !self.exclude(item, &item.attrs) {
            syn::visit::visit_variant(self, item);
        }
    }
}
fn analyze(sources: &[Source]) -> Result<Exclusions, syn::Error> {
    let mut result = Exclusions::default();
    for source in sources {
        let tree = syn::parse_file(&source.source)?;
        Visitor {
            path: &source.path,
            result: &mut result,
        }
        .visit_file(&tree);
    }
    Ok(result)
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    std::io::stdin()
        .take(4 * 1024 * 1024 + 1)
        .read_to_string(&mut input)?;
    if input.len() > 4 * 1024 * 1024 {
        return Err("coverage_source_limit".into());
    }
    let sources: Vec<Source> = serde_json::from_str(&input)?;
    println!("{}", serde_json::to_string(&analyze(&sources)?)?);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn modules_are_parsed_even_with_nested_braces_and_fake_markers_in_strings() {
        let source = "fn production() { let _ = \"#[cfg(test)] mod tests { }\"; }\n#[cfg(test)]\nmod checks {\n fn helper() { let _ = \"}\"; }\n}\nfn after_tests() {}\n";
        let out = analyze(&[Source {
            path: "desktop/src/sample.rs".into(),
            source: source.into(),
        }])
        .unwrap();
        assert_eq!(out.ranges["desktop/src/sample.rs"], [[2, 5]]);
    }
    #[test]
    fn conditional_items_and_external_test_files_remain_distinct() {
        let source = "#[cfg(all(test, unix))]\nfn fixture() {}\n#[cfg(any(test, feature = \"runtime\"))]\nfn production() {}\n#[cfg(test)]\n#[path = \"separate_tests.rs\"]\nmod checks;\n";
        let out = analyze(&[Source {
            path: "desktop/src/sample.rs".into(),
            source: source.into(),
        }])
        .unwrap();
        assert_eq!(out.ranges["desktop/src/sample.rs"], [[1, 2], [5, 7]]);
        assert_eq!(out.files, ["desktop/src/separate_tests.rs"]);
    }
    #[test]
    fn malformed_source_cannot_silently_remove_product_lines() {
        assert!(analyze(&[Source {
            path: "bad.rs".into(),
            source: "fn {".into()
        }])
        .is_err());
        assert!(!requires_test(&syn::parse_str("not(test)").unwrap()));
    }
}
