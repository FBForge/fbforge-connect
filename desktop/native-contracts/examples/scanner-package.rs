//! Build-only packer. Runtime installation independently verifies engine hashes and CVD signatures.
use fbforge_connect_native_contracts::{
    scanner_package as package, scanner_runtime::database_header,
};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
fn add(
    zip: &mut zip::ZipWriter<fs::File>,
    root: &Path,
    name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut input = fs::File::open(root.join(name))?;
    zip.start_file(
        name,
        zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated),
    )?;
    std::io::copy(&mut input, zip)?;
    Ok(())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        return Err("usage: scanner-package ROOT OUTPUT.zip".into());
    }
    let root = PathBuf::from(&args[1]);
    let output = PathBuf::from(&args[2]);
    let spec = package::verify_engine(&root.join("engine"))?;
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)?;
    let mut zip = zip::ZipWriter::new(file);
    for entry in spec.files {
        add(&mut zip, &root, &format!("engine/{}", entry.path))?;
    }
    for name in package::DATABASES {
        let (version, _) = database_header(&root.join("database").join(name))?;
        add(&mut zip, &root, &format!("database/{name}"))?;
        add(
            &mut zip,
            &root,
            &format!(
                "database/{}-{version}.cvd.sign",
                name.trim_end_matches(".cvd")
            ),
        )?;
    }
    zip.finish()?.flush()?;
    Ok(())
}
