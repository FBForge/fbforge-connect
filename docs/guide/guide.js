const navigation = document.getElementById('guide-navigation');
const narrow = matchMedia('(max-width: 800px)');
function adaptNavigation() {
  if (navigation) navigation.open = !narrow.matches;
}
adaptNavigation();
narrow.addEventListener('change', adaptNavigation);
const search = document.getElementById('guide-search');
search?.addEventListener('input', () => {
  const query = search.value.trim().toLocaleLowerCase('de');
  let count = 0;
  for (const item of document.querySelectorAll('nav li')) {
    item.hidden = !item.textContent.toLocaleLowerCase('de').includes(query);
    if (!item.hidden) count++;
  }
  document.getElementById('search-result').textContent = count ? '' : 'Kein passendes Thema gefunden.';
});
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy);
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source.textContent);
      document.getElementById('copy-result').textContent = 'Beispiel kopiert.';
    } catch {
      document.getElementById('copy-result').textContent =
        'Bitte markieren und kopieren Sie den Beispieltext.';
    }
  });
}
