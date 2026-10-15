# Before sharing MACH1

- **No shop data.** MACH1 holds no customer programs, machine memories or tool data. The tests read programs only
  from outside the folder. Keep it that way, and check `apps/` after each rebuild (the apps' defaults are generic).
- **Names.** Mazak, Mazatrol, Smooth and Matrix are Mazak Corporation's names. Describe MACH1 as working *with*
  Mazatrol programs, not as a Mazak product, and do not use Mazak's logo. Mitsubishi is Mitsubishi Electric
  Corporation's name: describe the EDM probing generator as working *with* Mitsubishi wire EDMs, not as a Mitsubishi
  product.
- **Where the format came from.** The Mazatrol format tables (`lib/schema.json`, and the editor built on them)
  were worked out by running SolutionWare's MazEdit in an emulator and comparing its output. Check that the
  licenses of the software involved allow publishing what was learned that way before releasing publicly. The
  emulator scripts themselves are not part of MACH1.
- **What came from Mazak's documents.** The editor's G- and M-code lists, TPC parameter names, bit meanings and
  drawings are short summaries and drawings of our own, made with the machine's manuals as reference; no manual text
  or figures are copied. The alarm list ships alarm numbers and titles (from the control's message file) with our own
  short categories; the cause and action text is loaded by the user from their own control's help file and is not
  part of MACH1. If in doubt, the alarm titles can be removed the same way (loaded from the user's file).
- **The EDM probing generator.** Its command forms and the measuring macros' argument letters were read from one
  machine's own program memory (its built-in macros' comment headers), not from a manual. It ships only short
  descriptions of our own, the macros' L numbers and argument letters, and a list of H-variable numbers to avoid; no
  macro code, customer programs, part numbers or machine positions. Keep its templates generic.
- **License.** MACH1 is under the GNU GPL v3 (`LICENSE`).
- **No warranty.** Keep a notice that the programs these tools write must be checked on the machine before they
  are run, and that the plots and cutter paths are approximate.
- **The CAD app's third-party code.** `vendor/cad/SOURCES.md` lists every package the CAD page inlines, with its version, licence and source. All of them may go inside a GPL program: three.js (MIT), replicad (MIT) with its OpenCascade build (LGPL-2.1), flatbush (ISC), opentype.js (MIT), LibreDWG through libredwg-web (GPL-3, for DWG) occt-import-js (LGPL-2.1, for IGES) and pdf.js (Apache-2.0, for PDF). The page shows their licence texts under File → About. The OpenCascade WebAssembly is object code under the LGPL, so the source offer in `SOURCES.md` has to stay true while the page is shared. Keep the versions pinned and rebuild with `tools/vendor-cad`.
- **Mastercam.** Mastercam is CNC Software's name. The CAD app is "CAD in the browser" and does not claim to be Mastercam or to read its files. It turns away `.mcam` files with a note to save them as STEP or DXF from Mastercam. Its menus are laid out like many CAD programs, with no copied icons, text or help.
- **Third-party code.** `lib/clipper.js` is Angus Johnson's Clipper 6.4.2 (JavaScript port by Timo), under the
  Boost Software License, which allows it inside a GPL project. Keep its header, and the licence text if you
  ship it on its own.
