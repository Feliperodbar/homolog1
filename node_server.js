// Node server para exportar DOCX via redocx
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const React = require('react');
const { render, Document, Text } = require('redocx');

const app = express();
app.use(express.json({ limit: '25mb' }));

app.post('/export-docx', async (req, res) => {
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  const now = Date.now();
  const filename = `homolog_export_${now}.docx`;
  const outDir = path.join(os.tmpdir(), 'homolog1_docx');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);

  const children = [];
  children.push(
    React.createElement(
      Text,
      { key: 'title', style: { bold: true, size: 18 } },
      'Guia Homolog'
    )
  );
  steps.forEach((s, idx) => {
    const title = (s && s.title) || 'Passo';
    const tag = s && s.tag;
    const desc = (s && s.description) || '';
    children.push(
      React.createElement(
        Text,
        { key: `h-${idx}`, style: { bold: true, size: 14 } },
        `${idx + 1}. ${title}`
      )
    );
    if (tag) {
      children.push(
        React.createElement(
          Text,
          { key: `t-${idx}`, style: { bold: true, size: 11 } },
          `Tag: ${tag}`
        )
      );
    }
    if (desc) {
      children.push(
        React.createElement(Text, { key: `d-${idx}`, style: { size: 11 } }, desc)
      );
    }
    children.push(React.createElement(Text, { key: `sp-${idx}` }, ''));
  });

  const element = React.createElement(Document, null, ...children);
  try {
    await new Promise((resolve, reject) => {
      render(element, outPath, (err) => (err ? reject(err) : resolve()));
    });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    fs.createReadStream(outPath)
      .on('error', (e) => res.status(500).send(String(e)))
      .pipe(res)
      .on('finish', () => {
        setTimeout(() => {
          try {
            fs.unlinkSync(outPath);
          } catch {}
        }, 10000);
      });
  } catch (e) {
    console.error('redocx render error', e);
    res.status(500).send('Falha ao gerar DOCX via redocx');
  }
});

const PORT = process.env.PORT || 8020;
app.listen(PORT, () => {
  console.log(`redocx server listening on http://localhost:${PORT}`);
});

