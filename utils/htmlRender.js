const fs = require('fs');

function renderTemplateString(template, data) {
  return template.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (_, key) => {
    const parts = key.split('.');
    let val = data;
    for (const p of parts) val = val != null ? val[p] : undefined;
    return (val == null ? '' : String(val));
  });
}

function renderTemplateFile(filePath, data) {
  const tpl = fs.readFileSync(filePath, 'utf8');
  return renderTemplateString(tpl, data);
}

module.exports = { renderTemplateString, renderTemplateFile };


