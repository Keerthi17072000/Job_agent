// Resume templates are data: a layout, a header style, a heading style, a font and an accent colour.
// The CSS in index.css renders them from data attributes, so adding a template is one line here.
export const CATEGORIES = ['Simple', 'Modern', 'Bold header', 'Two-column'] as const;
export const FONTS = {
  georgia: ["Georgia, 'Times New Roman', serif", 'Georgia'], arial: ['Arial, Helvetica, sans-serif', 'Arial'], calibri: ["Calibri, 'Segoe UI', Arial, sans-serif", 'Calibri'],
  garamond: ["Garamond, 'Times New Roman', serif", 'Garamond'], courier: ["'Courier New', Courier, monospace", 'Courier New'], trebuchet: ["'Trebuchet MS', Arial, sans-serif", 'Trebuchet MS'], verdana: ['Verdana, Arial, sans-serif', 'Verdana'],
} as const;
export interface TemplateDef {
  id: string; name: string; category: typeof CATEGORIES[number];
  layout: 'single' | 'left' | 'right';                         // where the sidebar sits, if any
  head: 'left' | 'center' | 'split' | 'band';
  heading: 'rule' | 'plain' | 'bar' | 'caps' | 'pill' | 'side';
  font: keyof typeof FONTS; accent: string; side?: 'tint' | 'dark' | 'line'; small?: boolean;
}
const t = (id: string, name: string, category: TemplateDef['category'], layout: TemplateDef['layout'], head: TemplateDef['head'], heading: TemplateDef['heading'], font: TemplateDef['font'], accent: string, extra: Partial<TemplateDef> = {}): TemplateDef =>
  ({ id, name, category, layout, head, heading, font, accent, ...extra });

export const TEMPLATE_DEFS: TemplateDef[] = [
  t('classic', 'Classic', 'Simple', 'single', 'center', 'rule', 'georgia', '#111111'),
  t('minimal', 'Minimal', 'Simple', 'single', 'left', 'plain', 'arial', '#555555'),
  t('compact', 'Compact', 'Simple', 'single', 'left', 'bar', 'calibri', '#111111', { small: true }),
  t('elegant', 'Elegant', 'Simple', 'single', 'center', 'caps', 'garamond', '#7a5c2e'),
  t('typewriter', 'Typewriter', 'Simple', 'single', 'left', 'rule', 'courier', '#111111', { small: true }),
  t('ledger', 'Ledger', 'Simple', 'single', 'split', 'rule', 'georgia', '#1f2937'),

  t('modern', 'Modern', 'Modern', 'single', 'left', 'rule', 'arial', '#4b32c3'),
  t('teal', 'Teal', 'Modern', 'single', 'split', 'rule', 'trebuchet', '#0f766e'),
  t('maroon', 'Maroon', 'Modern', 'single', 'center', 'rule', 'georgia', '#7f1d1d'),
  t('slate', 'Slate', 'Modern', 'single', 'split', 'pill', 'verdana', '#334155', { small: true }),
  t('ocean', 'Ocean', 'Modern', 'single', 'left', 'side', 'arial', '#1d4ed8'),
  t('forest', 'Forest', 'Modern', 'single', 'left', 'bar', 'trebuchet', '#166534'),

  t('banner', 'Banner', 'Bold header', 'single', 'band', 'rule', 'arial', '#1f2a44'),
  t('emerald', 'Emerald', 'Bold header', 'single', 'band', 'pill', 'trebuchet', '#065f46'),
  t('charcoal', 'Charcoal', 'Bold header', 'single', 'band', 'caps', 'georgia', '#111827'),
  t('sunset', 'Sunset', 'Bold header', 'single', 'band', 'bar', 'arial', '#9a3412'),
  t('royal', 'Royal', 'Bold header', 'single', 'band', 'side', 'calibri', '#4c1d95'),
  t('crimson', 'Crimson', 'Bold header', 'single', 'band', 'plain', 'verdana', '#9f1239', { small: true }),

  t('sidebar', 'Sidebar', 'Two-column', 'left', 'left', 'rule', 'arial', '#1f2a44', { side: 'tint' }),
  t('navy-column', 'Navy column', 'Two-column', 'left', 'band', 'rule', 'arial', '#1f2a44', { side: 'dark' }),
  t('lilac', 'Lilac', 'Two-column', 'right', 'left', 'side', 'trebuchet', '#6d28d9', { side: 'tint' }),
  t('teal-split', 'Teal split', 'Two-column', 'right', 'split', 'rule', 'calibri', '#0f766e', { side: 'line' }),
  t('burgundy', 'Burgundy', 'Two-column', 'left', 'center', 'caps', 'georgia', '#7f1d1d', { side: 'line' }),
  t('graphite', 'Graphite', 'Two-column', 'left', 'band', 'pill', 'verdana', '#374151', { side: 'dark', small: true }),
  t('mint', 'Mint', 'Two-column', 'right', 'band', 'bar', 'arial', '#047857', { side: 'tint' }),
];
export const templateById = (id: string | null) => TEMPLATE_DEFS.find(d => d.id === id) ?? TEMPLATE_DEFS[0];
/** Attributes and CSS variables that make a .resume-page render as this template. */
export const paperProps = (d: TemplateDef) => ({
  'data-tpl': d.id, 'data-layout': d.layout, 'data-head': d.head, 'data-heading': d.heading, 'data-side': d.side ?? 'none',
  style: { '--accent': d.accent, '--font': FONTS[d.font][0], '--fs': d.small ? '9.5pt' : '10.5pt' } as React.CSSProperties,
});
