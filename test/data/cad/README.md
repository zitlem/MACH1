# Test files for the CAD app

- `libredwg-example-2018.dwg` is the AutoCAD 2018 example drawing from LibreDWG's test data
  (https://github.com/LibreDWG/libredwg, `test/test-data/example_2018.dwg`). LibreDWG is under the GNU GPL v3, like
  MACH1. It holds lines, arcs, splines, an ellipse, polylines, blocks and layers in millimetres, plus text and
  dimensions that are not read.

- `lzw-b9.Z`, `lzw-b12.Z` and `lzw-b16.Z` are made-up text (test/cad-test.js makes the same text again) compressed
  with Unix `compress -b 9`, `-b 12` and `-b 16`, for the reader of compressed files (some machine controls save
  their drawings that way). `rect-dxf.Z` is a 2 × 1 rectangle as a DXF, compressed.

No customer drawings are kept here. To check your own files, read them in place with
`MACH1_CAD_FILES=<folder> node test/cad-files.js`.
