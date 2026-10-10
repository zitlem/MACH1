# Feeds and Speeds

`apps/Feeds and Speeds.html` works out spindle speed and feed for high-efficiency machining, and checks the cut
against your machine. One offline file; open it in Chrome or Edge. Inch (metric taps included).

## Tools

- **End mill**: HEM, profile, slot or finish.
  - **HEM** sets the stepover from the depth: 15% of D at 1×D deep, down to 7% past 3×D (5% more in aluminium),
    because a long reach bends and chatters.
  - **Finish** leaves 0.012 on the wall at full depth, about 13% faster with a light chip, and explains the spring
    pass (the same path again with no offset change).
  - Radial chip thinning raises the programmed feed per tooth so the real chip stays at the target.
- **Helix / bore**: helical interpolation down into a hole, or one circular turn at full depth from a pre-drilled
  hole (with a finish pass and spring pass). It gives:
  - the tool centre path Ø (hole − tool);
  - the feed at the cutting edge and the slower feed at the tool centre that the program needs (edge × path ÷
    hole), in in/min and in/rev;
  - the step down per turn from the ramp angle (1.5° in steel, 3° in aluminium, 1° in stainless and titanium),
    the turns and the time;
  - a WHILE-loop G-code helix. It warns when the tool must be centre-cutting, when chips will pack, and when a
    hole over twice the tool leaves a core.
- **Tapered end mill**: tip diameter, angle per side, square or ball tip (with its radius). The RPM comes from the
  widest diameter in the cut (tip + 2 × depth × tan angle) so the top of the cut stays at the surface speed; the
  stepover, chip and reach rules use the diameter halfway up the cut, and the bending uses the thicker tapered core.
  It warns when the tip runs much slower than the top (fine for finishing walls, slow for roughing).
- **Ball end mill**: speed from the diameter actually cutting at your depth, 2·√(ap·(D − ap)), with the chip
  thinning of both the shallow depth and the stepover.
- **High-feed mill** and **face mill**: the lead angle thins the chip by sin(lead), so feed per tooth = chip ÷
  sin(lead) (15° high-feed: × 3.9; 45° face mill: × 1.4), plus radial thinning for a narrow cut.
- **Chamfer mill** (indexable): smallest diameter, edge angle from the axis (45° for a 90° chamfer mill, 15° for a
  steep cutter such as a CoroMill 495 -7509), insert edge length and depth. RPM comes from the diameter in the
  middle of the cut, the chip is thinned by sin(90° − edge angle) and made lighter as more of the edge is in the
  cut. Enter a width for an angled shoulder; it warns about chatter and says how to quiet it.
- **Drill**: carbide, cobalt or HSS; feed per rev from the diameter; the depth to the point; G81, G73 or G83
  with a peck when the hole is deep.
- **Tap**: cut or form (roll) tap, UNC/UNF/metric or any thread typed in (`3/8-16`, `M10x1.5`); feed = RPM ×
  pitch; the tap drill for the % thread you want (75% cut, 65% form) and the nearest standard drills with the %
  thread each gives.
- **Reamer**: speed and feed, the stock to leave and the drill to use first.

## Coatings

Every solid tool (end mills, ball and tapered mills, helix, drills, taps, reamers) takes a coating: Best for the
material (the numbers' baseline: AlTiN in steels, stainless, cast iron and titanium; ZrN or polished uncoated in
aluminium and brass), Uncoated (bright), TiN (gold), TiCN (blue-grey), TiAlN (violet-grey), AlTiN (black), AlCrN
(blue-grey), ZrN (pale gold), TiB2 (silver), DLC (dark grey) or diamond (CVD). Under the list the app says what the
chosen coating is, its colour, and names tool makers sell it under (such as Balinit A for TiN or Alcrona for AlCrN). Each scales the surface
speed for the material; for example uncoated carbide in steel runs at 75%, AlCrN at 105%, DLC in aluminium at 120%,
diamond at 135%. It warns about aluminium-based coatings in aluminium (it sticks), DLC or diamond in steel and other
iron-based metals (they break down), and TiN on carbide. Indexable cutters (high-feed, face and chamfer mills) keep
their insert grade's numbers.

## What it shows

RPM and surface speed, feed in/min and per rev (for bores: at the centre and at the edge), the programmed and real chip, stepover and depth, metal removal,
spindle power (from the material's unit power and the drive efficiency) as a share of your spindle, torque, the
tangential cutting force and how far the tool bends at its stick-out (a warning over 0.001"). **How it is worked
out** lists every formula with your numbers, and a G-code snippet gives the S, F and canned cycle.

Warnings: RPM or feed over the machine's limits, power over 80%, depth past the flutes, stick-out over 4× D,
heavy HEM stepover, deep slotting, big chip-thinning factors, deep holes, form taps in materials that don't form,
very high % thread. Chatter: at over 2.5× D deep it gives the order to try (lighter stepover first, then ±10–15%
RPM, then split the depth), and for chamfer mills in a shoulder.

## Overrides, machine and tool list

- Leave a field blank to use the calculated value (shown in grey); type a value to override the surface speed,
  chip, RPM or feed.
- **Machine**: max spindle RPM, spindle horsepower, max feed, max tapping RPM and drive efficiency. Kept in the
  browser.
- **Tool list**: add the current tool with a name, load it back later, print the list as a sheet, or export and
  import it as a file to share between PCs.

## Library

`lib/feeds.js` works in Node too:

```js
const FEEDS = require('./lib/feeds.js');
const r = FEEDS.calc({ tool: 'endmill', mat: 'a36', D: 0.5, Z: 4, op: 'hem' });
console.log(r.rpm, r.feed, r.fzProg, r.hp, r.warnings);
console.log(FEEDS.gcode(r).join('\n'));
```

Materials: `a36`, `s1045`, `s4140`, `tool`, `ss304`, `ci`, `al6061`, `brass`, `ti64` (`FEEDS.MATERIALS` holds the
starting numbers; add your own there). `test/feeds-test.js` checks the formulas.

**The numbers are starting points for the material and tool.** Check them against your tool maker's
recommendations, and start a new tool or material on the low side.
