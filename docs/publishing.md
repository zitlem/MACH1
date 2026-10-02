# Before sharing MACH1

- **No shop data.** MACH1 holds no customer programs, machine memories or tool data. The tests read programs only
  from outside the folder. Keep it that way, and check `apps/` after each rebuild (the apps' defaults are generic).
- **Names.** Mazak, Mazatrol, Smooth and Matrix are Mazak Corporation's names. Describe MACH1 as working *with*
  Mazatrol programs, not as a Mazak product, and do not use Mazak's logo.
- **Where the format came from.** The Mazatrol format tables (`lib/schema.json`, and the editor built on them)
  were worked out by running SolutionWare's MazEdit in an emulator and comparing its output. Check that the
  licenses of the software involved allow publishing what was learned that way before releasing publicly. The
  emulator scripts themselves are not part of MACH1.
- **What came from Mazak's documents.** The editor's G- and M-code lists, TPC parameter names, bit meanings and
  drawings are short summaries and drawings of our own, made with the machine's manuals as reference; no manual text
  or figures are copied. The alarm list ships alarm numbers and titles (from the control's message file) with our own
  short categories; the cause and action text is loaded by the user from their own control's help file and is not
  part of MACH1. If in doubt, the alarm titles can be removed the same way (loaded from the user's file).
- **License.** MACH1 is under the GNU GPL v3 (`LICENSE`).
- **No warranty.** Keep a notice that the programs these tools write must be checked on the machine before they
  are run, and that the plots and cutter paths are approximate.
- **Third-party code.** `lib/clipper.js` is Angus Johnson's Clipper 6.4.2 (JavaScript port by Timo), under the
  Boost Software License, which allows it inside a GPL project. Keep its header, and the licence text if you
  ship it on its own.
