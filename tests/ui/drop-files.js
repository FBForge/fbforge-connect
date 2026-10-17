/** Real File/DataTransfer objects exercise the same DOM path as an OS file drop. */
export async function dropFiles(page, target, files) {
  const transfer = await page.evaluateHandle((items) => {
    const data = new DataTransfer();
    for (const item of items) data.items.add(new File([item.content], item.name, { type: item.type || '' }));
    return data;
  }, files);
  try {
    await target.dispatchEvent('dragenter', { dataTransfer: transfer });
    await target.dispatchEvent('dragover', { dataTransfer: transfer });
    await target.dispatchEvent('drop', { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
}
