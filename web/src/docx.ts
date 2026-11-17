// Minimal real .docx (WordprocessingML in a zip): single column, plain paragraphs, no tables or text boxes, so ATS parsers
// and this app's own uploader can read it back. Layout mirrors resumeText() in engine/ats.ts.
import JSZip from 'jszip';
import { bullets, flatSkills } from '../../engine/ats.ts';
import type { Profile } from '../../engine/types.ts';

export const TEMPLATES = { classic: 'Classic', modern: 'Modern', compact: 'Compact', minimal: 'Minimal' } as const;
export type Template = keyof typeof TEMPLATES;
const STYLE: Record<Template, { font: string; color: string; size: number; center?: boolean; rule: boolean }> = {
  classic: { font: 'Georgia', color: '111111', size: 21, center: true, rule: true }, modern: { font: 'Arial', color: '4B32C3', size: 21, rule: true },
  compact: { font: 'Calibri', color: '111111', size: 19, rule: false }, minimal: { font: 'Arial', color: '555555', size: 21, rule: false },
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export async function buildDocx(p: Profile, template: Template): Promise<Blob> {
  const st = STYLE[template];
  const para = (text: string, o: { bold?: boolean; size?: number; color?: string; center?: boolean; before?: number; rule?: boolean } = {}) =>
    `<w:p><w:pPr>${o.rule ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${st.color}"/></w:pBdr>` : ''}<w:spacing w:before="${o.before ?? 0}" w:after="60"/>${o.center ? '<w:jc w:val="center"/>' : ''}</w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="${st.font}" w:hAnsi="${st.font}" w:cs="${st.font}"/>${o.bold ? '<w:b/>' : ''}<w:color w:val="${o.color ?? '111111'}"/><w:sz w:val="${o.size ?? st.size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const head = (t: string) => para(t.toUpperCase(), { bold: true, size: st.size + 1, color: st.color, before: 240, rule: st.rule });
  const body: string[] = [];
  if (p.name) body.push(para(p.name, { bold: template !== 'minimal', size: 44, color: st.color, center: st.center }));
  if (p.currentDesignation) body.push(para(p.currentDesignation, { size: st.size + 3, center: st.center }));
  const contact = [p.email, p.phone, p.location].filter(Boolean).join(' | ');
  if (contact) body.push(para(contact, { color: '333333', center: st.center }));
  if (p.summary) body.push(head('Summary'), para(p.summary));
  if (flatSkills(p).length) body.push(head('Skills'), para(flatSkills(p).join(', ')));
  if (p.experience.length) {
    body.push(head('Experience'));
    for (const e of p.experience) body.push(para([e.title, e.company].filter(Boolean).join(' | '), { bold: true, before: 120 }), para([e.start, e.end].filter(Boolean).join(' – '), { color: '444444' }), ...bullets(e.summary).map(b => para(`• ${b}`)));
  }
  if (p.projects.length) { body.push(head('Projects')); for (const x of p.projects) body.push(para(x.name, { bold: true, before: 120 }), ...(x.description ? [para(x.description)] : [])); }
  if (p.education.length) body.push(head('Education'), ...p.education.map(e => para([e.degree, e.institution, e.year].filter(Boolean).join(', '))));
  if (p.certifications.length) body.push(head('Certifications'), ...p.certifications.map(c => para(c)));

  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
