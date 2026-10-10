// Writes FIELDS.md: for every control, every unit's fields and the fields of its lines, as MACH1 names them.
const fs = require('fs'), path = require('path');
const M = require('../mach1.js');
const out = ['# MACH1 field names', '',
  'The names MACH1 uses for every field, per control. They are the screen\'s column headings; a heading used twice on',
  'a line gets #2, #3. Fields with no heading are named by byte, such as @11 (the tool suffix on many tool lines).',
  'Any field can also be named by its byte (@36). Some fields only apply for certain tools or patterns; the',
  'screen shows those as ◆ and MACH1 reports them if you set them.', ''];
for (const ctl of M.controls()) {
  out.push('## ' + M.core.CONTROLS[ctl].label + ' (' + ctl + ', .' + M.core.CONTROLS[ctl].ext + ')', '');
  for (const u of M.describe(ctl)) {
    out.push('### ' + u.unit, '', '- unit: ' + (u.fields.join(', ') || '(none)'));
    for (const l of u.lines) out.push('- ' + l.line + ' (code ' + l.code.toString(16) + '): ' + (l.fields.join(', ') || '(none)'));
    out.push('');
  }
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'FIELDS.md'), out.join('\n'));
console.log('wrote docs/FIELDS.md');
