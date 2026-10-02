// HEM bundle: Clipper (Boost licence), hem-geo and hem. Load with <script src="hem.bundle.js"></script>, then use
// window.HEM (and window.HEMGeo); load mach1.bundle.js too for HEM.toMazatrol(result, MACH1).
/*******************************************************************************
 *                                                                              *
 * Author    :  Angus Johnson                                                   *
 * Version   :  6.4.2                                                           *
 * Date      :  27 February 2017                                                *
 * Website   :  http://www.angusj.com                                           *
 * Copyright :  Angus Johnson 2010-2017                                         *
 *                                                                              *
 * License:                                                                     *
 * Use, modification & distribution is subject to Boost Software License Ver 1. *
 * http://www.boost.org/LICENSE_1_0.txt                                         *
 *                                                                              *
 * Attributions:                                                                *
 * The code in this library is an extension of Bala Vatti's clipping algorithm: *
 * "A generic solution to polygon clipping"                                     *
 * Communications of the ACM, Vol 35, Issue 7 (July 1992) pp 56-63.             *
 * http://portal.acm.org/citation.cfm?id=129906                                 *
 *                                                                              *
 * Computer graphics and geometric modeling: implementation and algorithms      *
 * By Max K. Agoston                                                            *
 * Springer; 1 edition (January 4, 2005)                                        *
 * http://books.google.com/books?q=vatti+clipping+agoston                       *
 *                                                                              *
 * See also:                                                                    *
 * "Polygon Offsetting by Computing Winding Numbers"                            *
 * Paper no. DETC2005-85513 pp. 565-575                                         *
 * ASME 2005 International Design Engineering Technical Conferences             *
 * and Computers and Information in Engineering Conference (IDETC/CIE2005)      *
 * September 24-28, 2005 , Long Beach, California, USA                          *
 * http://www.me.berkeley.edu/~mcmains/pubs/DAC05OffsetPolygon.pdf              *
 *                                                                              *
 *******************************************************************************/
/*******************************************************************************
 *                                                                              *
 * Author    :  Timo                                                            *
 * Version   :  6.4.2.2                                                         *
 * Date      :  8 September 2017                                                 *
 *                                                                              *
 * This is a translation of the C# Clipper library to Javascript.               *
 * Int128 struct of C# is implemented using JSBN of Tom Wu.                     *
 * Because Javascript lacks support for 64-bit integers, the space              *
 * is a little more restricted than in C# version.                              *
 *                                                                              *
 * C# version has support for coordinate space:                                 *
 * +-4611686018427387903 ( sqrt(2^127 -1)/2 )                                   *
 * while Javascript version has support for space:                              *
 * +-4503599627370495 ( sqrt(2^106 -1)/2 )                                      *
 *                                                                              *
 * Tom Wu's JSBN proved to be the fastest big integer library:                  *
 * http://jsperf.com/big-integer-library-test                                   *
 *                                                                              *
 * This class can be made simpler when (if ever) 64-bit integer support comes   *
 * or floating point Clipper is released.                                       *
 *                                                                              *
 *******************************************************************************/
/*******************************************************************************
 *                                                                              *
 * Basic JavaScript BN library - subset useful for RSA encryption.              *
 * http://www-cs-students.stanford.edu/~tjw/jsbn/                               *
 * Copyright (c) 2005  Tom Wu                                                   *
 * All Rights Reserved.                                                         *
 * See "LICENSE" for details:                                                   *
 * http://www-cs-students.stanford.edu/~tjw/jsbn/LICENSE                        *
 *                                                                              *
 *******************************************************************************/
(function ()
{
	"use strict";
	var ClipperLib = {};
	ClipperLib.version = '6.4.2.2';

	//UseLines: Enables open path clipping. Adds a very minor cost to performance.
	ClipperLib.use_lines = true;

	//ClipperLib.use_xyz: adds a Z member to IntPoint. Adds a minor cost to performance.
	ClipperLib.use_xyz = false;

	var isNode = false;
	if (typeof module !== 'undefined' && module.exports)
	{
		module.exports = ClipperLib;
		isNode = true;
	}
	else
	{
		if (typeof define === 'function' && define.amd) {
			define(ClipperLib);
		}
		if (typeof (document) !== "undefined") window.ClipperLib = ClipperLib;
		else self['ClipperLib'] = ClipperLib;
	}
	var navigator_appName;
	if (!isNode)
	{
		var nav = navigator.userAgent.toString().toLowerCase();
		navigator_appName = navigator.appName;
	}
	else
	{
		var nav = "chrome"; // Node.js uses Chrome's V8 engine
		navigator_appName = "Netscape"; // Firefox, Chrome and Safari returns "Netscape", so Node.js should also
	}
	// Browser test to speedup performance critical functions
	var browser = {};

	if (nav.indexOf("chrome") != -1 && nav.indexOf("chromium") == -1) browser.chrome = 1;
	else browser.chrome = 0;
	if (nav.indexOf("chromium") != -1) browser.chromium = 1;
	else browser.chromium = 0;
	if (nav.indexOf("safari") != -1 && nav.indexOf("chrome") == -1 && nav.indexOf("chromium") == -1) browser.safari = 1;
	else browser.safari = 0;
	if (nav.indexOf("firefox") != -1) browser.firefox = 1;
	else browser.firefox = 0;
	if (nav.indexOf("firefox/17") != -1) browser.firefox17 = 1;
	else browser.firefox17 = 0;
	if (nav.indexOf("firefox/15") != -1) browser.firefox15 = 1;
	else browser.firefox15 = 0;
	if (nav.indexOf("firefox/3") != -1) browser.firefox3 = 1;
	else browser.firefox3 = 0;
	if (nav.indexOf("opera") != -1) browser.opera = 1;
	else browser.opera = 0;
	if (nav.indexOf("msie 10") != -1) browser.msie10 = 1;
	else browser.msie10 = 0;
	if (nav.indexOf("msie 9") != -1) browser.msie9 = 1;
	else browser.msie9 = 0;
	if (nav.indexOf("msie 8") != -1) browser.msie8 = 1;
	else browser.msie8 = 0;
	if (nav.indexOf("msie 7") != -1) browser.msie7 = 1;
	else browser.msie7 = 0;
	if (nav.indexOf("msie ") != -1) browser.msie = 1;
	else browser.msie = 0;
	ClipperLib.biginteger_used = null;

	// Copyright (c) 2005  Tom Wu
	// All Rights Reserved.
	// See "LICENSE" for details.
	// Basic JavaScript BN library - subset useful for RSA encryption.
	// Bits per digit
	var dbits;
	// JavaScript engine analysis
	var canary = 0xdeadbeefcafe;
	var j_lm = ((canary & 0xffffff) == 0xefcafe);
	// (public) Constructor
	/**
	* @constructor
	*/
	function BigInteger(a, b, c)
	{
		// This test variable can be removed,
		// but at least for performance tests it is useful piece of knowledge
		// This is the only ClipperLib related variable in BigInteger library
		ClipperLib.biginteger_used = 1;
		if (a != null)
			if ("number" == typeof a && "undefined" == typeof (b)) this.fromInt(a); // faster conversion
			else if ("number" == typeof a) this.fromNumber(a, b, c);
		else if (b == null && "string" != typeof a) this.fromString(a, 256);
		else this.fromString(a, b);
	}
	// return new, unset BigInteger
	function nbi()
	{
		return new BigInteger(null, undefined, undefined);
	}
	// am: Compute w_j += (x*this_i), propagate carries,
	// c is initial carry, returns final carry.
	// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
	// We need to select the fastest one that works in this environment.
	// am1: use a single mult and divide to get the high bits,
	// max digit bits should be 26 because
	// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
	function am1(i, x, w, j, c, n)
	{
		while (--n >= 0)
		{
			var v = x * this[i++] + w[j] + c;
			c = Math.floor(v / 0x4000000);
			w[j++] = v & 0x3ffffff;
		}
		return c;
	}
	// am2 avoids a big mult-and-extract completely.
	// Max digit bits should be <= 30 because we do bitwise ops
	// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
	function am2(i, x, w, j, c, n)
	{
		var xl = x & 0x7fff,
			xh = x >> 15;
		while (--n >= 0)
		{
			var l = this[i] & 0x7fff;
			var h = this[i++] >> 15;
			var m = xh * l + h * xl;
			l = xl * l + ((m & 0x7fff) << 15) + w[j] + (c & 0x3fffffff);
			c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
			w[j++] = l & 0x3fffffff;
		}
		return c;
	}
	// Alternately, set max digit bits to 28 since some
	// browsers slow down when dealing with 32-bit numbers.
	function am3(i, x, w, j, c, n)
	{
		var xl = x & 0x3fff,
			xh = x >> 14;
		while (--n >= 0)
		{
			var l = this[i] & 0x3fff;
			var h = this[i++] >> 14;
			var m = xh * l + h * xl;
			l = xl * l + ((m & 0x3fff) << 14) + w[j] + c;
			c = (l >> 28) + (m >> 14) + xh * h;
			w[j++] = l & 0xfffffff;
		}
		return c;
	}
	if (j_lm && (navigator_appName == "Microsoft Internet Explorer"))
	{
		BigInteger.prototype.am = am2;
		dbits = 30;
	}
	else if (j_lm && (navigator_appName != "Netscape"))
	{
		BigInteger.prototype.am = am1;
		dbits = 26;
	}
	else
	{ // Mozilla/Netscape seems to prefer am3
		BigInteger.prototype.am = am3;
		dbits = 28;
	}
	BigInteger.prototype.DB = dbits;
	BigInteger.prototype.DM = ((1 << dbits) - 1);
	BigInteger.prototype.DV = (1 << dbits);
	var BI_FP = 52;
	BigInteger.prototype.FV = Math.pow(2, BI_FP);
	BigInteger.prototype.F1 = BI_FP - dbits;
	BigInteger.prototype.F2 = 2 * dbits - BI_FP;
	// Digit conversions
	var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
	var BI_RC = new Array();
	var rr, vv;
	rr = "0".charCodeAt(0);
	for (vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
	rr = "a".charCodeAt(0);
	for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
	rr = "A".charCodeAt(0);
	for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

	function int2char(n)
	{
		return BI_RM.charAt(n);
	}

	function intAt(s, i)
	{
		var c = BI_RC[s.charCodeAt(i)];
		return (c == null) ? -1 : c;
	}
	// (protected) copy this to r
	function bnpCopyTo(r)
	{
		for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
		r.t = this.t;
		r.s = this.s;
	}
	// (protected) set from integer value x, -DV <= x < DV
	function bnpFromInt(x)
	{
		this.t = 1;
		this.s = (x < 0) ? -1 : 0;
		if (x > 0) this[0] = x;
		else if (x < -1) this[0] = x + this.DV;
		else this.t = 0;
	}
	// return bigint initialized to value
	function nbv(i)
	{
		var r = nbi();
		r.fromInt(i);
		return r;
	}
	// (protected) set from string and radix
	function bnpFromString(s, b)
	{
		var k;
		if (b == 16) k = 4;
		else if (b == 8) k = 3;
		else if (b == 256) k = 8; // byte array
		else if (b == 2) k = 1;
		else if (b == 32) k = 5;
		else if (b == 4) k = 2;
		else
		{
			this.fromRadix(s, b);
			return;
		}
		this.t = 0;
		this.s = 0;
		var i = s.length,
			mi = false,
			sh = 0;
		while (--i >= 0)
		{
			var x = (k == 8) ? s[i] & 0xff : intAt(s, i);
			if (x < 0)
			{
				if (s.charAt(i) == "-") mi = true;
				continue;
			}
			mi = false;
			if (sh == 0)
				this[this.t++] = x;
			else if (sh + k > this.DB)
			{
				this[this.t - 1] |= (x & ((1 << (this.DB - sh)) - 1)) << sh;
				this[this.t++] = (x >> (this.DB - sh));
			}
			else
				this[this.t - 1] |= x << sh;
			sh += k;
			if (sh >= this.DB) sh -= this.DB;
		}
		if (k == 8 && (s[0] & 0x80) != 0)
		{
			this.s = -1;
			if (sh > 0) this[this.t - 1] |= ((1 << (this.DB - sh)) - 1) << sh;
		}
		this.clamp();
		if (mi) BigInteger.ZERO.subTo(this, this);
	}
	// (protected) clamp off excess high words
	function bnpClamp()
	{
		var c = this.s & this.DM;
		while (this.t > 0 && this[this.t - 1] == c) --this.t;
	}
	// (public) return string representation in given radix
	function bnToString(b)
	{
		if (this.s < 0) return "-" + this.negate().toString(b);
		var k;
		if (b == 16) k = 4;
		else if (b == 8) k = 3;
		else if (b == 2) k = 1;
		else if (b == 32) k = 5;
		else if (b == 4) k = 2;
		else return this.toRadix(b);
		var km = (1 << k) - 1,
			d, m = false,
			r = "",
			i = this.t;
		var p = this.DB - (i * this.DB) % k;
		if (i-- > 0)
		{
			if (p < this.DB && (d = this[i] >> p) > 0)
			{
				m = true;
				r = int2char(d);
			}
			while (i >= 0)
			{
				if (p < k)
				{
					d = (this[i] & ((1 << p) - 1)) << (k - p);
					d |= this[--i] >> (p += this.DB - k);
				}
				else
				{
					d = (this[i] >> (p -= k)) & km;
					if (p <= 0)
					{
						p += this.DB;
						--i;
					}
				}
				if (d > 0) m = true;
				if (m) r += int2char(d);
			}
		}
		return m ? r : "0";
	}
	// (public) -this
	function bnNegate()
	{
		var r = nbi();
		BigInteger.ZERO.subTo(this, r);
		return r;
	}
	// (public) |this|
	function bnAbs()
	{
		return (this.s < 0) ? this.negate() : this;
	}
	// (public) return + if this > a, - if this < a, 0 if equal
	function bnCompareTo(a)
	{
		var r = this.s - a.s;
		if (r != 0) return r;
		var i = this.t;
		r = i - a.t;
		if (r != 0) return (this.s < 0) ? -r : r;
		while (--i >= 0)
			if ((r = this[i] - a[i]) != 0) return r;
		return 0;
	}
	// returns bit length of the integer x
	function nbits(x)
	{
		var r = 1,
			t;
		if ((t = x >>> 16) != 0)
		{
			x = t;
			r += 16;
		}
		if ((t = x >> 8) != 0)
		{
			x = t;
			r += 8;
		}
		if ((t = x >> 4) != 0)
		{
			x = t;
			r += 4;
		}
		if ((t = x >> 2) != 0)
		{
			x = t;
			r += 2;
		}
		if ((t = x >> 1) != 0)
		{
			x = t;
			r += 1;
		}
		return r;
	}
	// (public) return the number of bits in "this"
	function bnBitLength()
	{
		if (this.t <= 0) return 0;
		return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ (this.s & this.DM));
	}
	// (protected) r = this << n*DB
	function bnpDLShiftTo(n, r)
	{
		var i;
		for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
		for (i = n - 1; i >= 0; --i) r[i] = 0;
		r.t = this.t + n;
		r.s = this.s;
	}
	// (protected) r = this >> n*DB
	function bnpDRShiftTo(n, r)
	{
		for (var i = n; i < this.t; ++i) r[i - n] = this[i];
		r.t = Math.max(this.t - n, 0);
		r.s = this.s;
	}
	// (protected) r = this << n
	function bnpLShiftTo(n, r)
	{
		var bs = n % this.DB;
		var cbs = this.DB - bs;
		var bm = (1 << cbs) - 1;
		var ds = Math.floor(n / this.DB),
			c = (this.s << bs) & this.DM,
			i;
		for (i = this.t - 1; i >= 0; --i)
		{
			r[i + ds + 1] = (this[i] >> cbs) | c;
			c = (this[i] & bm) << bs;
		}
		for (i = ds - 1; i >= 0; --i) r[i] = 0;
		r[ds] = c;
		r.t = this.t + ds + 1;
		r.s = this.s;
		r.clamp();
	}
	// (protected) r = this >> n
	function bnpRShiftTo(n, r)
	{
		r.s = this.s;
		var ds = Math.floor(n / this.DB);
		if (ds >= this.t)
		{
			r.t = 0;
			return;
		}
		var bs = n % this.DB;
		var cbs = this.DB - bs;
		var bm = (1 << bs) - 1;
		r[0] = this[ds] >> bs;
		for (var i = ds + 1; i < this.t; ++i)
		{
			r[i - ds - 1] |= (this[i] & bm) << cbs;
			r[i - ds] = this[i] >> bs;
		}
		if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
		r.t = this.t - ds;
		r.clamp();
	}
	// (protected) r = this - a
	function bnpSubTo(a, r)
	{
		var i = 0,
			c = 0,
			m = Math.min(a.t, this.t);
		while (i < m)
		{
			c += this[i] - a[i];
			r[i++] = c & this.DM;
			c >>= this.DB;
		}
		if (a.t < this.t)
		{
			c -= a.s;
			while (i < this.t)
			{
				c += this[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c += this.s;
		}
		else
		{
			c += this.s;
			while (i < a.t)
			{
				c -= a[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c -= a.s;
		}
		r.s = (c < 0) ? -1 : 0;
		if (c < -1) r[i++] = this.DV + c;
		else if (c > 0) r[i++] = c;
		r.t = i;
		r.clamp();
	}
	// (protected) r = this * a, r != this,a (HAC 14.12)
	// "this" should be the larger one if appropriate.
	function bnpMultiplyTo(a, r)
	{
		var x = this.abs(),
			y = a.abs();
		var i = x.t;
		r.t = i + y.t;
		while (--i >= 0) r[i] = 0;
		for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
		r.s = 0;
		r.clamp();
		if (this.s != a.s) BigInteger.ZERO.subTo(r, r);
	}
	// (protected) r = this^2, r != this (HAC 14.16)
	function bnpSquareTo(r)
	{
		var x = this.abs();
		var i = r.t = 2 * x.t;
		while (--i >= 0) r[i] = 0;
		for (i = 0; i < x.t - 1; ++i)
		{
			var c = x.am(i, x[i], r, 2 * i, 0, 1);
			if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV)
			{
				r[i + x.t] -= x.DV;
				r[i + x.t + 1] = 1;
			}
		}
		if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
		r.s = 0;
		r.clamp();
	}
	// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
	// r != q, this != m.  q or r may be null.
	function bnpDivRemTo(m, q, r)
	{
		var pm = m.abs();
		if (pm.t <= 0) return;
		var pt = this.abs();
		if (pt.t < pm.t)
		{
			if (q != null) q.fromInt(0);
			if (r != null) this.copyTo(r);
			return;
		}
		if (r == null) r = nbi();
		var y = nbi(),
			ts = this.s,
			ms = m.s;
		var nsh = this.DB - nbits(pm[pm.t - 1]); // normalize modulus
		if (nsh > 0)
		{
			pm.lShiftTo(nsh, y);
			pt.lShiftTo(nsh, r);
		}
		else
		{
			pm.copyTo(y);
			pt.copyTo(r);
		}
		var ys = y.t;
		var y0 = y[ys - 1];
		if (y0 == 0) return;
		var yt = y0 * (1 << this.F1) + ((ys > 1) ? y[ys - 2] >> this.F2 : 0);
		var d1 = this.FV / yt,
			d2 = (1 << this.F1) / yt,
			e = 1 << this.F2;
		var i = r.t,
			j = i - ys,
			t = (q == null) ? nbi() : q;
		y.dlShiftTo(j, t);
		if (r.compareTo(t) >= 0)
		{
			r[r.t++] = 1;
			r.subTo(t, r);
		}
		BigInteger.ONE.dlShiftTo(ys, t);
		t.subTo(y, y); // "negative" y so we can replace sub with am later
		while (y.t < ys) y[y.t++] = 0;
		while (--j >= 0)
		{
			// Estimate quotient digit
			var qd = (r[--i] == y0) ? this.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
			if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd)
			{ // Try it out
				y.dlShiftTo(j, t);
				r.subTo(t, r);
				while (r[i] < --qd) r.subTo(t, r);
			}
		}
		if (q != null)
		{
			r.drShiftTo(ys, q);
			if (ts != ms) BigInteger.ZERO.subTo(q, q);
		}
		r.t = ys;
		r.clamp();
		if (nsh > 0) r.rShiftTo(nsh, r); // Denormalize remainder
		if (ts < 0) BigInteger.ZERO.subTo(r, r);
	}
	// (public) this mod a
	function bnMod(a)
	{
		var r = nbi();
		this.abs().divRemTo(a, null, r);
		if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
		return r;
	}
	// Modular reduction using "classic" algorithm
	/**
	* @constructor
	*/
	function Classic(m)
	{
		this.m = m;
	}

	function cConvert(x)
	{
		if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
		else return x;
	}

	function cRevert(x)
	{
		return x;
	}

	function cReduce(x)
	{
		x.divRemTo(this.m, null, x);
	}

	function cMulTo(x, y, r)
	{
		x.multiplyTo(y, r);
		this.reduce(r);
	}

	function cSqrTo(x, r)
	{
		x.squareTo(r);
		this.reduce(r);
	}
	Classic.prototype.convert = cConvert;
	Classic.prototype.revert = cRevert;
	Classic.prototype.reduce = cReduce;
	Classic.prototype.mulTo = cMulTo;
	Classic.prototype.sqrTo = cSqrTo;
	// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
	// justification:
	//         xy == 1 (mod m)
	//         xy =  1+km
	//   xy(2-xy) = (1+km)(1-km)
	// x[y(2-xy)] = 1-k^2m^2
	// x[y(2-xy)] == 1 (mod m^2)
	// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
	// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
	// JS multiply "overflows" differently from C/C++, so care is needed here.
	function bnpInvDigit()
	{
		if (this.t < 1) return 0;
		var x = this[0];
		if ((x & 1) == 0) return 0;
		var y = x & 3; // y == 1/x mod 2^2
		y = (y * (2 - (x & 0xf) * y)) & 0xf; // y == 1/x mod 2^4
		y = (y * (2 - (x & 0xff) * y)) & 0xff; // y == 1/x mod 2^8
		y = (y * (2 - (((x & 0xffff) * y) & 0xffff))) & 0xffff; // y == 1/x mod 2^16
		// last step - calculate inverse mod DV directly;
		// assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
		y = (y * (2 - x * y % this.DV)) % this.DV; // y == 1/x mod 2^dbits
		// we really want the negative inverse, and -DV < y < DV
		return (y > 0) ? this.DV - y : -y;
	}
	// Montgomery reduction
	/**
	* @constructor
	*/
	function Montgomery(m)
	{
		this.m = m;
		this.mp = m.invDigit();
		this.mpl = this.mp & 0x7fff;
		this.mph = this.mp >> 15;
		this.um = (1 << (m.DB - 15)) - 1;
		this.mt2 = 2 * m.t;
	}
	// xR mod m
	function montConvert(x)
	{
		var r = nbi();
		x.abs().dlShiftTo(this.m.t, r);
		r.divRemTo(this.m, null, r);
		if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
		return r;
	}
	// x/R mod m
	function montRevert(x)
	{
		var r = nbi();
		x.copyTo(r);
		this.reduce(r);
		return r;
	}
	// x = x/R mod m (HAC 14.32)
	function montReduce(x)
	{
		while (x.t <= this.mt2) // pad x so am has enough room later
			x[x.t++] = 0;
		for (var i = 0; i < this.m.t; ++i)
		{
			// faster way of calculating u0 = x[i]*mp mod DV
			var j = x[i] & 0x7fff;
			var u0 = (j * this.mpl + (((j * this.mph + (x[i] >> 15) * this.mpl) & this.um) << 15)) & x.DM;
			// use am to combine the multiply-shift-add into one call
			j = i + this.m.t;
			x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
			// propagate carry
			while (x[j] >= x.DV)
			{
				x[j] -= x.DV;
				x[++j]++;
			}
		}
		x.clamp();
		x.drShiftTo(this.m.t, x);
		if (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
	}
	// r = "x^2/R mod m"; x != r
	function montSqrTo(x, r)
	{
		x.squareTo(r);
		this.reduce(r);
	}
	// r = "xy/R mod m"; x,y != r
	function montMulTo(x, y, r)
	{
		x.multiplyTo(y, r);
		this.reduce(r);
	}
	Montgomery.prototype.convert = montConvert;
	Montgomery.prototype.revert = montRevert;
	Montgomery.prototype.reduce = montReduce;
	Montgomery.prototype.mulTo = montMulTo;
	Montgomery.prototype.sqrTo = montSqrTo;
	// (protected) true iff this is even
	function bnpIsEven()
	{
		return ((this.t > 0) ? (this[0] & 1) : this.s) == 0;
	}
	// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
	function bnpExp(e, z)
	{
		if (e > 0xffffffff || e < 1) return BigInteger.ONE;
		var r = nbi(),
			r2 = nbi(),
			g = z.convert(this),
			i = nbits(e) - 1;
		g.copyTo(r);
		while (--i >= 0)
		{
			z.sqrTo(r, r2);
			if ((e & (1 << i)) > 0) z.mulTo(r2, g, r);
			else
			{
				var t = r;
				r = r2;
				r2 = t;
			}
		}
		return z.revert(r);
	}
	// (public) this^e % m, 0 <= e < 2^32
	function bnModPowInt(e, m)
	{
		var z;
		if (e < 256 || m.isEven()) z = new Classic(m);
		else z = new Montgomery(m);
		return this.exp(e, z);
	}
	// protected
	BigInteger.prototype.copyTo = bnpCopyTo;
	BigInteger.prototype.fromInt = bnpFromInt;
	BigInteger.prototype.fromString = bnpFromString;
	BigInteger.prototype.clamp = bnpClamp;
	BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
	BigInteger.prototype.drShiftTo = bnpDRShiftTo;
	BigInteger.prototype.lShiftTo = bnpLShiftTo;
	BigInteger.prototype.rShiftTo = bnpRShiftTo;
	BigInteger.prototype.subTo = bnpSubTo;
	BigInteger.prototype.multiplyTo = bnpMultiplyTo;
	BigInteger.prototype.squareTo = bnpSquareTo;
	BigInteger.prototype.divRemTo = bnpDivRemTo;
	BigInteger.prototype.invDigit = bnpInvDigit;
	BigInteger.prototype.isEven = bnpIsEven;
	BigInteger.prototype.exp = bnpExp;
	// public
	BigInteger.prototype.toString = bnToString;
	BigInteger.prototype.negate = bnNegate;
	BigInteger.prototype.abs = bnAbs;
	BigInteger.prototype.compareTo = bnCompareTo;
	BigInteger.prototype.bitLength = bnBitLength;
	BigInteger.prototype.mod = bnMod;
	BigInteger.prototype.modPowInt = bnModPowInt;
	// "constants"
	BigInteger.ZERO = nbv(0);
	BigInteger.ONE = nbv(1);
	// Copyright (c) 2005-2009  Tom Wu
	// All Rights Reserved.
	// See "LICENSE" for details.
	// Extended JavaScript BN functions, required for RSA private ops.
	// Version 1.1: new BigInteger("0", 10) returns "proper" zero
	// Version 1.2: square() API, isProbablePrime fix
	// (public)
	function bnClone()
	{
		var r = nbi();
		this.copyTo(r);
		return r;
	}
	// (public) return value as integer
	function bnIntValue()
	{
		if (this.s < 0)
		{
			if (this.t == 1) return this[0] - this.DV;
			else if (this.t == 0) return -1;
		}
		else if (this.t == 1) return this[0];
		else if (this.t == 0) return 0;
		// assumes 16 < DB < 32
		return ((this[1] & ((1 << (32 - this.DB)) - 1)) << this.DB) | this[0];
	}
	// (public) return value as byte
	function bnByteValue()
	{
		return (this.t == 0) ? this.s : (this[0] << 24) >> 24;
	}
	// (public) return value as short (assumes DB>=16)
	function bnShortValue()
	{
		return (this.t == 0) ? this.s : (this[0] << 16) >> 16;
	}
	// (protected) return x s.t. r^x < DV
	function bnpChunkSize(r)
	{
		return Math.floor(Math.LN2 * this.DB / Math.log(r));
	}
	// (public) 0 if this == 0, 1 if this > 0
	function bnSigNum()
	{
		if (this.s < 0) return -1;
		else if (this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
		else return 1;
	}
	// (protected) convert to radix string
	function bnpToRadix(b)
	{
		if (b == null) b = 10;
		if (this.signum() == 0 || b < 2 || b > 36) return "0";
		var cs = this.chunkSize(b);
		var a = Math.pow(b, cs);
		var d = nbv(a),
			y = nbi(),
			z = nbi(),
			r = "";
		this.divRemTo(d, y, z);
		while (y.signum() > 0)
		{
			r = (a + z.intValue()).toString(b).substr(1) + r;
			y.divRemTo(d, y, z);
		}
		return z.intValue().toString(b) + r;
	}
	// (protected) convert from radix string
	function bnpFromRadix(s, b)
	{
		this.fromInt(0);
		if (b == null) b = 10;
		var cs = this.chunkSize(b);
		var d = Math.pow(b, cs),
			mi = false,
			j = 0,
			w = 0;
		for (var i = 0; i < s.length; ++i)
		{
			var x = intAt(s, i);
			if (x < 0)
			{
				if (s.charAt(i) == "-" && this.signum() == 0) mi = true;
				continue;
			}
			w = b * w + x;
			if (++j >= cs)
			{
				this.dMultiply(d);
				this.dAddOffset(w, 0);
				j = 0;
				w = 0;
			}
		}
		if (j > 0)
		{
			this.dMultiply(Math.pow(b, j));
			this.dAddOffset(w, 0);
		}
		if (mi) BigInteger.ZERO.subTo(this, this);
	}
	// (protected) alternate constructor
	function bnpFromNumber(a, b, c)
	{
		if ("number" == typeof b)
		{
			// new BigInteger(int,int,RNG)
			if (a < 2) this.fromInt(1);
			else
			{
				this.fromNumber(a, c);
				if (!this.testBit(a - 1)) // force MSB set
					this.bitwiseTo(BigInteger.ONE.shiftLeft(a - 1), op_or, this);
				if (this.isEven()) this.dAddOffset(1, 0); // force odd
				while (!this.isProbablePrime(b))
				{
					this.dAddOffset(2, 0);
					if (this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a - 1), this);
				}
			}
		}
		else
		{
			// new BigInteger(int,RNG)
			var x = new Array(),
				t = a & 7;
			x.length = (a >> 3) + 1;
			b.nextBytes(x);
			if (t > 0) x[0] &= ((1 << t) - 1);
			else x[0] = 0;
			this.fromString(x, 256);
		}
	}
	// (public) convert to bigendian byte array
	function bnToByteArray()
	{
		var i = this.t,
			r = new Array();
		r[0] = this.s;
		var p = this.DB - (i * this.DB) % 8,
			d, k = 0;
		if (i-- > 0)
		{
			if (p < this.DB && (d = this[i] >> p) != (this.s & this.DM) >> p)
				r[k++] = d | (this.s << (this.DB - p));
			while (i >= 0)
			{
				if (p < 8)
				{
					d = (this[i] & ((1 << p) - 1)) << (8 - p);
					d |= this[--i] >> (p += this.DB - 8);
				}
				else
				{
					d = (this[i] >> (p -= 8)) & 0xff;
					if (p <= 0)
					{
						p += this.DB;
						--i;
					}
				}
				if ((d & 0x80) != 0) d |= -256;
				if (k == 0 && (this.s & 0x80) != (d & 0x80)) ++k;
				if (k > 0 || d != this.s) r[k++] = d;
			}
		}
		return r;
	}

	function bnEquals(a)
	{
		return (this.compareTo(a) == 0);
	}

	function bnMin(a)
	{
		return (this.compareTo(a) < 0) ? this : a;
	}

	function bnMax(a)
	{
		return (this.compareTo(a) > 0) ? this : a;
	}
	// (protected) r = this op a (bitwise)
	function bnpBitwiseTo(a, op, r)
	{
		var i, f, m = Math.min(a.t, this.t);
		for (i = 0; i < m; ++i) r[i] = op(this[i], a[i]);
		if (a.t < this.t)
		{
			f = a.s & this.DM;
			for (i = m; i < this.t; ++i) r[i] = op(this[i], f);
			r.t = this.t;
		}
		else
		{
			f = this.s & this.DM;
			for (i = m; i < a.t; ++i) r[i] = op(f, a[i]);
			r.t = a.t;
		}
		r.s = op(this.s, a.s);
		r.clamp();
	}
	// (public) this & a
	function op_and(x, y)
	{
		return x & y;
	}

	function bnAnd(a)
	{
		var r = nbi();
		this.bitwiseTo(a, op_and, r);
		return r;
	}
	// (public) this | a
	function op_or(x, y)
	{
		return x | y;
	}

	function bnOr(a)
	{
		var r = nbi();
		this.bitwiseTo(a, op_or, r);
		return r;
	}
	// (public) this ^ a
	function op_xor(x, y)
	{
		return x ^ y;
	}

	function bnXor(a)
	{
		var r = nbi();
		this.bitwiseTo(a, op_xor, r);
		return r;
	}
	// (public) this & ~a
	function op_andnot(x, y)
	{
		return x & ~y;
	}

	function bnAndNot(a)
	{
		var r = nbi();
		this.bitwiseTo(a, op_andnot, r);
		return r;
	}
	// (public) ~this
	function bnNot()
	{
		var r = nbi();
		for (var i = 0; i < this.t; ++i) r[i] = this.DM & ~this[i];
		r.t = this.t;
		r.s = ~this.s;
		return r;
	}
	// (public) this << n
	function bnShiftLeft(n)
	{
		var r = nbi();
		if (n < 0) this.rShiftTo(-n, r);
		else this.lShiftTo(n, r);
		return r;
	}
	// (public) this >> n
	function bnShiftRight(n)
	{
		var r = nbi();
		if (n < 0) this.lShiftTo(-n, r);
		else this.rShiftTo(n, r);
		return r;
	}
	// return index of lowest 1-bit in x, x < 2^31
	function lbit(x)
	{
		if (x == 0) return -1;
		var r = 0;
		if ((x & 0xffff) == 0)
		{
			x >>= 16;
			r += 16;
		}
		if ((x & 0xff) == 0)
		{
			x >>= 8;
			r += 8;
		}
		if ((x & 0xf) == 0)
		{
			x >>= 4;
			r += 4;
		}
		if ((x & 3) == 0)
		{
			x >>= 2;
			r += 2;
		}
		if ((x & 1) == 0) ++r;
		return r;
	}
	// (public) returns index of lowest 1-bit (or -1 if none)
	function bnGetLowestSetBit()
	{
		for (var i = 0; i < this.t; ++i)
			if (this[i] != 0) return i * this.DB + lbit(this[i]);
		if (this.s < 0) return this.t * this.DB;
		return -1;
	}
	// return number of 1 bits in x
	function cbit(x)
	{
		var r = 0;
		while (x != 0)
		{
			x &= x - 1;
			++r;
		}
		return r;
	}
	// (public) return number of set bits
	function bnBitCount()
	{
		var r = 0,
			x = this.s & this.DM;
		for (var i = 0; i < this.t; ++i) r += cbit(this[i] ^ x);
		return r;
	}
	// (public) true iff nth bit is set
	function bnTestBit(n)
	{
		var j = Math.floor(n / this.DB);
		if (j >= this.t) return (this.s != 0);
		return ((this[j] & (1 << (n % this.DB))) != 0);
	}
	// (protected) this op (1<<n)
	function bnpChangeBit(n, op)
	{
		var r = BigInteger.ONE.shiftLeft(n);
		this.bitwiseTo(r, op, r);
		return r;
	}
	// (public) this | (1<<n)
	function bnSetBit(n)
	{
		return this.changeBit(n, op_or);
	}
	// (public) this & ~(1<<n)
	function bnClearBit(n)
	{
		return this.changeBit(n, op_andnot);
	}
	// (public) this ^ (1<<n)
	function bnFlipBit(n)
	{
		return this.changeBit(n, op_xor);
	}
	// (protected) r = this + a
	function bnpAddTo(a, r)
	{
		var i = 0,
			c = 0,
			m = Math.min(a.t, this.t);
		while (i < m)
		{
			c += this[i] + a[i];
			r[i++] = c & this.DM;
			c >>= this.DB;
		}
		if (a.t < this.t)
		{
			c += a.s;
			while (i < this.t)
			{
				c += this[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c += this.s;
		}
		else
		{
			c += this.s;
			while (i < a.t)
			{
				c += a[i];
				r[i++] = c & this.DM;
				c >>= this.DB;
			}
			c += a.s;
		}
		r.s = (c < 0) ? -1 : 0;
		if (c > 0) r[i++] = c;
		else if (c < -1) r[i++] = this.DV + c;
		r.t = i;
		r.clamp();
	}
	// (public) this + a
	function bnAdd(a)
	{
		var r = nbi();
		this.addTo(a, r);
		return r;
	}
	// (public) this - a
	function bnSubtract(a)
	{
		var r = nbi();
		this.subTo(a, r);
		return r;
	}
	// (public) this * a
	function bnMultiply(a)
	{
		var r = nbi();
		this.multiplyTo(a, r);
		return r;
	}
	// (public) this^2
	function bnSquare()
	{
		var r = nbi();
		this.squareTo(r);
		return r;
	}
	// (public) this / a
	function bnDivide(a)
	{
		var r = nbi();
		this.divRemTo(a, r, null);
		return r;
	}
	// (public) this % a
	function bnRemainder(a)
	{
		var r = nbi();
		this.divRemTo(a, null, r);
		return r;
	}
	// (public) [this/a,this%a]
	function bnDivideAndRemainder(a)
	{
		var q = nbi(),
			r = nbi();
		this.divRemTo(a, q, r);
		return new Array(q, r);
	}
	// (protected) this *= n, this >= 0, 1 < n < DV
	function bnpDMultiply(n)
	{
		this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
		++this.t;
		this.clamp();
	}
	// (protected) this += n << w words, this >= 0
	function bnpDAddOffset(n, w)
	{
		if (n == 0) return;
		while (this.t <= w) this[this.t++] = 0;
		this[w] += n;
		while (this[w] >= this.DV)
		{
			this[w] -= this.DV;
			if (++w >= this.t) this[this.t++] = 0;
			++this[w];
		}
	}
	// A "null" reducer
	/**
	* @constructor
	*/
	function NullExp()
	{}

	function nNop(x)
	{
		return x;
	}

	function nMulTo(x, y, r)
	{
		x.multiplyTo(y, r);
	}

	function nSqrTo(x, r)
	{
		x.squareTo(r);
	}
	NullExp.prototype.convert = nNop;
	NullExp.prototype.revert = nNop;
	NullExp.prototype.mulTo = nMulTo;
	NullExp.prototype.sqrTo = nSqrTo;
	// (public) this^e
	function bnPow(e)
	{
		return this.exp(e, new NullExp());
	}
	// (protected) r = lower n words of "this * a", a.t <= n
	// "this" should be the larger one if appropriate.
	function bnpMultiplyLowerTo(a, n, r)
	{
		var i = Math.min(this.t + a.t, n);
		r.s = 0; // assumes a,this >= 0
		r.t = i;
		while (i > 0) r[--i] = 0;
		var j;
		for (j = r.t - this.t; i < j; ++i) r[i + this.t] = this.am(0, a[i], r, i, 0, this.t);
		for (j = Math.min(a.t, n); i < j; ++i) this.am(0, a[i], r, i, 0, n - i);
		r.clamp();
	}
	// (protected) r = "this * a" without lower n words, n > 0
	// "this" should be the larger one if appropriate.
	function bnpMultiplyUpperTo(a, n, r)
	{
		--n;
		var i = r.t = this.t + a.t - n;
		r.s = 0; // assumes a,this >= 0
		while (--i >= 0) r[i] = 0;
		for (i = Math.max(n - this.t, 0); i < a.t; ++i)
			r[this.t + i - n] = this.am(n - i, a[i], r, 0, 0, this.t + i - n);
		r.clamp();
		r.drShiftTo(1, r);
	}
	// Barrett modular reduction
	/**
	* @constructor
	*/
	function Barrett(m)
	{
		// setup Barrett
		this.r2 = nbi();
		this.q3 = nbi();
		BigInteger.ONE.dlShiftTo(2 * m.t, this.r2);
		this.mu = this.r2.divide(m);
		this.m = m;
	}

	function barrettConvert(x)
	{
		if (x.s < 0 || x.t > 2 * this.m.t) return x.mod(this.m);
		else if (x.compareTo(this.m) < 0) return x;
		else
		{
			var r = nbi();
			x.copyTo(r);
			this.reduce(r);
			return r;
		}
	}

	function barrettRevert(x)
	{
		return x;
	}
	// x = x mod m (HAC 14.42)
	function barrettReduce(x)
	{
		x.drShiftTo(this.m.t - 1, this.r2);
		if (x.t > this.m.t + 1)
		{
			x.t = this.m.t + 1;
			x.clamp();
		}
		this.mu.multiplyUpperTo(this.r2, this.m.t + 1, this.q3);
		this.m.multiplyLowerTo(this.q3, this.m.t + 1, this.r2);
		while (x.compareTo(this.r2) < 0) x.dAddOffset(1, this.m.t + 1);
		x.subTo(this.r2, x);
		while (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
	}
	// r = x^2 mod m; x != r
	function barrettSqrTo(x, r)
	{
		x.squareTo(r);
		this.reduce(r);
	}
	// r = x*y mod m; x,y != r
	function barrettMulTo(x, y, r)
	{
		x.multiplyTo(y, r);
		this.reduce(r);
	}
	Barrett.prototype.convert = barrettConvert;
	Barrett.prototype.revert = barrettRevert;
	Barrett.prototype.reduce = barrettReduce;
	Barrett.prototype.mulTo = barrettMulTo;
	Barrett.prototype.sqrTo = barrettSqrTo;
	// (public) this^e % m (HAC 14.85)
	function bnModPow(e, m)
	{
		var i = e.bitLength(),
			k, r = nbv(1),
			z;
		if (i <= 0) return r;
		else if (i < 18) k = 1;
		else if (i < 48) k = 3;
		else if (i < 144) k = 4;
		else if (i < 768) k = 5;
		else k = 6;
		if (i < 8)
			z = new Classic(m);
		else if (m.isEven())
			z = new Barrett(m);
		else
			z = new Montgomery(m);
		// precomputation
		var g = new Array(),
			n = 3,
			k1 = k - 1,
			km = (1 << k) - 1;
		g[1] = z.convert(this);
		if (k > 1)
		{
			var g2 = nbi();
			z.sqrTo(g[1], g2);
			while (n <= km)
			{
				g[n] = nbi();
				z.mulTo(g2, g[n - 2], g[n]);
				n += 2;
			}
		}
		var j = e.t - 1,
			w, is1 = true,
			r2 = nbi(),
			t;
		i = nbits(e[j]) - 1;
		while (j >= 0)
		{
			if (i >= k1) w = (e[j] >> (i - k1)) & km;
			else
			{
				w = (e[j] & ((1 << (i + 1)) - 1)) << (k1 - i);
				if (j > 0) w |= e[j - 1] >> (this.DB + i - k1);
			}
			n = k;
			while ((w & 1) == 0)
			{
				w >>= 1;
				--n;
			}
			if ((i -= n) < 0)
			{
				i += this.DB;
				--j;
			}
			if (is1)
			{ // ret == 1, don't bother squaring or multiplying it
				g[w].copyTo(r);
				is1 = false;
			}
			else
			{
				while (n > 1)
				{
					z.sqrTo(r, r2);
					z.sqrTo(r2, r);
					n -= 2;
				}
				if (n > 0) z.sqrTo(r, r2);
				else
				{
					t = r;
					r = r2;
					r2 = t;
				}
				z.mulTo(r2, g[w], r);
			}
			while (j >= 0 && (e[j] & (1 << i)) == 0)
			{
				z.sqrTo(r, r2);
				t = r;
				r = r2;
				r2 = t;
				if (--i < 0)
				{
					i = this.DB - 1;
					--j;
				}
			}
		}
		return z.revert(r);
	}
	// (public) gcd(this,a) (HAC 14.54)
	function bnGCD(a)
	{
		var x = (this.s < 0) ? this.negate() : this.clone();
		var y = (a.s < 0) ? a.negate() : a.clone();
		if (x.compareTo(y) < 0)
		{
			var t = x;
			x = y;
			y = t;
		}
		var i = x.getLowestSetBit(),
			g = y.getLowestSetBit();
		if (g < 0) return x;
		if (i < g) g = i;
		if (g > 0)
		{
			x.rShiftTo(g, x);
			y.rShiftTo(g, y);
		}
		while (x.signum() > 0)
		{
			if ((i = x.getLowestSetBit()) > 0) x.rShiftTo(i, x);
			if ((i = y.getLowestSetBit()) > 0) y.rShiftTo(i, y);
			if (x.compareTo(y) >= 0)
			{
				x.subTo(y, x);
				x.rShiftTo(1, x);
			}
			else
			{
				y.subTo(x, y);
				y.rShiftTo(1, y);
			}
		}
		if (g > 0) y.lShiftTo(g, y);
		return y;
	}
	// (protected) this % n, n < 2^26
	function bnpModInt(n)
	{
		if (n <= 0) return 0;
		var d = this.DV % n,
			r = (this.s < 0) ? n - 1 : 0;
		if (this.t > 0)
			if (d == 0) r = this[0] % n;
			else
				for (var i = this.t - 1; i >= 0; --i) r = (d * r + this[i]) % n;
		return r;
	}
	// (public) 1/this % m (HAC 14.61)
	function bnModInverse(m)
	{
		var ac = m.isEven();
		if ((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
		var u = m.clone(),
			v = this.clone();
		var a = nbv(1),
			b = nbv(0),
			c = nbv(0),
			d = nbv(1);
		while (u.signum() != 0)
		{
			while (u.isEven())
			{
				u.rShiftTo(1, u);
				if (ac)
				{
					if (!a.isEven() || !b.isEven())
					{
						a.addTo(this, a);
						b.subTo(m, b);
					}
					a.rShiftTo(1, a);
				}
				else if (!b.isEven()) b.subTo(m, b);
				b.rShiftTo(1, b);
			}
			while (v.isEven())
			{
				v.rShiftTo(1, v);
				if (ac)
				{
					if (!c.isEven() || !d.isEven())
					{
						c.addTo(this, c);
						d.subTo(m, d);
					}
					c.rShiftTo(1, c);
				}
				else if (!d.isEven()) d.subTo(m, d);
				d.rShiftTo(1, d);
			}
			if (u.compareTo(v) >= 0)
			{
				u.subTo(v, u);
				if (ac) a.subTo(c, a);
				b.subTo(d, b);
			}
			else
			{
				v.subTo(u, v);
				if (ac) c.subTo(a, c);
				d.subTo(b, d);
			}
		}
		if (v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
		if (d.compareTo(m) >= 0) return d.subtract(m);
		if (d.signum() < 0) d.addTo(m, d);
		else return d;
		if (d.signum() < 0) return d.add(m);
		else return d;
	}
	var lowprimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997];
	var lplim = (1 << 26) / lowprimes[lowprimes.length - 1];
	// (public) test primality with certainty >= 1-.5^t
	function bnIsProbablePrime(t)
	{
		var i, x = this.abs();
		if (x.t == 1 && x[0] <= lowprimes[lowprimes.length - 1])
		{
			for (i = 0; i < lowprimes.length; ++i)
				if (x[0] == lowprimes[i]) return true;
			return false;
		}
		if (x.isEven()) return false;
		i = 1;
		while (i < lowprimes.length)
		{
			var m = lowprimes[i],
				j = i + 1;
			while (j < lowprimes.length && m < lplim) m *= lowprimes[j++];
			m = x.modInt(m);
			while (i < j)
				if (m % lowprimes[i++] == 0) return false;
		}
		return x.millerRabin(t);
	}
	// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
	function bnpMillerRabin(t)
	{
		var n1 = this.subtract(BigInteger.ONE);
		var k = n1.getLowestSetBit();
		if (k <= 0) return false;
		var r = n1.shiftRight(k);
		t = (t + 1) >> 1;
		if (t > lowprimes.length) t = lowprimes.length;
		var a = nbi();
		for (var i = 0; i < t; ++i)
		{
			//Pick bases at random, instead of starting at 2
			a.fromInt(lowprimes[Math.floor(Math.random() * lowprimes.length)]);
			var y = a.modPow(r, this);
			if (y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0)
			{
				var j = 1;
				while (j++ < k && y.compareTo(n1) != 0)
				{
					y = y.modPowInt(2, this);
					if (y.compareTo(BigInteger.ONE) == 0) return false;
				}
				if (y.compareTo(n1) != 0) return false;
			}
		}
		return true;
	}
	// protected
	BigInteger.prototype.chunkSize = bnpChunkSize;
	BigInteger.prototype.toRadix = bnpToRadix;
	BigInteger.prototype.fromRadix = bnpFromRadix;
	BigInteger.prototype.fromNumber = bnpFromNumber;
	BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
	BigInteger.prototype.changeBit = bnpChangeBit;
	BigInteger.prototype.addTo = bnpAddTo;
	BigInteger.prototype.dMultiply = bnpDMultiply;
	BigInteger.prototype.dAddOffset = bnpDAddOffset;
	BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
	BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
	BigInteger.prototype.modInt = bnpModInt;
	BigInteger.prototype.millerRabin = bnpMillerRabin;
	// public
	BigInteger.prototype.clone = bnClone;
	BigInteger.prototype.intValue = bnIntValue;
	BigInteger.prototype.byteValue = bnByteValue;
	BigInteger.prototype.shortValue = bnShortValue;
	BigInteger.prototype.signum = bnSigNum;
	BigInteger.prototype.toByteArray = bnToByteArray;
	BigInteger.prototype.equals = bnEquals;
	BigInteger.prototype.min = bnMin;
	BigInteger.prototype.max = bnMax;
	BigInteger.prototype.and = bnAnd;
	BigInteger.prototype.or = bnOr;
	BigInteger.prototype.xor = bnXor;
	BigInteger.prototype.andNot = bnAndNot;
	BigInteger.prototype.not = bnNot;
	BigInteger.prototype.shiftLeft = bnShiftLeft;
	BigInteger.prototype.shiftRight = bnShiftRight;
	BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
	BigInteger.prototype.bitCount = bnBitCount;
	BigInteger.prototype.testBit = bnTestBit;
	BigInteger.prototype.setBit = bnSetBit;
	BigInteger.prototype.clearBit = bnClearBit;
	BigInteger.prototype.flipBit = bnFlipBit;
	BigInteger.prototype.add = bnAdd;
	BigInteger.prototype.subtract = bnSubtract;
	BigInteger.prototype.multiply = bnMultiply;
	BigInteger.prototype.divide = bnDivide;
	BigInteger.prototype.remainder = bnRemainder;
	BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
	BigInteger.prototype.modPow = bnModPow;
	BigInteger.prototype.modInverse = bnModInverse;
	BigInteger.prototype.pow = bnPow;
	BigInteger.prototype.gcd = bnGCD;
	BigInteger.prototype.isProbablePrime = bnIsProbablePrime;
	// JSBN-specific extension
	BigInteger.prototype.square = bnSquare;
	var Int128 = BigInteger;
	// BigInteger interfaces not implemented in jsbn:
	// BigInteger(int signum, byte[] magnitude)
	// double doubleValue()
	// float floatValue()
	// int hashCode()
	// long longValue()
	// static BigInteger valueOf(long val)
	// Helper functions to make BigInteger functions callable with two parameters
	// as in original C# Clipper
	Int128.prototype.IsNegative = function ()
	{
		if (this.compareTo(Int128.ZERO) == -1) return true;
		else return false;
	};

	Int128.op_Equality = function (val1, val2)
	{
		if (val1.compareTo(val2) == 0) return true;
		else return false;
	};

	Int128.op_Inequality = function (val1, val2)
	{
		if (val1.compareTo(val2) != 0) return true;
		else return false;
	};

	Int128.op_GreaterThan = function (val1, val2)
	{
		if (val1.compareTo(val2) > 0) return true;
		else return false;
	};

	Int128.op_LessThan = function (val1, val2)
	{
		if (val1.compareTo(val2) < 0) return true;
		else return false;
	};

	Int128.op_Addition = function (lhs, rhs)
	{
		return new Int128(lhs, undefined, undefined).add(new Int128(rhs, undefined, undefined));
	};

	Int128.op_Subtraction = function (lhs, rhs)
	{
		return new Int128(lhs, undefined, undefined).subtract(new Int128(rhs, undefined, undefined));
	};

	Int128.Int128Mul = function (lhs, rhs)
	{
		return new Int128(lhs, undefined, undefined).multiply(new Int128(rhs, undefined, undefined));
	};

	Int128.op_Division = function (lhs, rhs)
	{
		return lhs.divide(rhs);
	};

	Int128.prototype.ToDouble = function ()
	{
		return parseFloat(this.toString()); // This could be something faster
	};

	// end of Int128 section
	/*
	// Uncomment the following two lines if you want to use Int128 outside ClipperLib
	if (typeof(document) !== "undefined") window.Int128 = Int128;
	else self.Int128 = Int128;
	*/

	// ---------------------------------------------

	// Here starts the actual Clipper library:
	// Helper function to support Inheritance in Javascript
	var Inherit = function (ce, ce2)
	{
		var p;
		if (typeof (Object.getOwnPropertyNames) === 'undefined')
		{
			for (p in ce2.prototype)
				if (typeof (ce.prototype[p]) === 'undefined' || ce.prototype[p] === Object.prototype[p]) ce.prototype[p] = ce2.prototype[p];
			for (p in ce2)
				if (typeof (ce[p]) === 'undefined') ce[p] = ce2[p];
			ce.$baseCtor = ce2;
		}
		else
		{
			var props = Object.getOwnPropertyNames(ce2.prototype);
			for (var i = 0; i < props.length; i++)
				if (typeof (Object.getOwnPropertyDescriptor(ce.prototype, props[i])) === 'undefined') Object.defineProperty(ce.prototype, props[i], Object.getOwnPropertyDescriptor(ce2.prototype, props[i]));
			for (p in ce2)
				if (typeof (ce[p]) === 'undefined') ce[p] = ce2[p];
			ce.$baseCtor = ce2;
		}
	};

	/**
	* @constructor
	*/
	ClipperLib.Path = function ()
	{
		return [];
	};

	ClipperLib.Path.prototype.push = Array.prototype.push;

	/**
	* @constructor
	*/
	ClipperLib.Paths = function ()
	{
		return []; // Was previously [[]], but caused problems when pushed
	};

	ClipperLib.Paths.prototype.push = Array.prototype.push;

	// Preserves the calling way of original C# Clipper
	// Is essential due to compatibility, because DoublePoint is public class in original C# version
	/**
	* @constructor
	*/
	ClipperLib.DoublePoint = function ()
	{
		var a = arguments;
		this.X = 0;
		this.Y = 0;
		// public DoublePoint(DoublePoint dp)
		// public DoublePoint(IntPoint ip)
		if (a.length === 1)
		{
			this.X = a[0].X;
			this.Y = a[0].Y;
		}
		else if (a.length === 2)
		{
			this.X = a[0];
			this.Y = a[1];
		}
	}; // This is internal faster function when called without arguments
	/**
	* @constructor
	*/
	ClipperLib.DoublePoint0 = function ()
	{
		this.X = 0;
		this.Y = 0;
	};

	ClipperLib.DoublePoint0.prototype = ClipperLib.DoublePoint.prototype;

	// This is internal faster function when called with 1 argument (dp or ip)
	/**
	* @constructor
	*/
	ClipperLib.DoublePoint1 = function (dp)
	{
		this.X = dp.X;
		this.Y = dp.Y;
	};

	ClipperLib.DoublePoint1.prototype = ClipperLib.DoublePoint.prototype;

	// This is internal faster function when called with 2 arguments (x and y)
	/**
	* @constructor
	*/
	ClipperLib.DoublePoint2 = function (x, y)
	{
		this.X = x;
		this.Y = y;
	};

	ClipperLib.DoublePoint2.prototype = ClipperLib.DoublePoint.prototype;

	// PolyTree & PolyNode start
	/**
	* @suppress {missingProperties}
	*/
	ClipperLib.PolyNode = function ()
	{
		this.m_Parent = null;
		this.m_polygon = new ClipperLib.Path();
		this.m_Index = 0;
		this.m_jointype = 0;
		this.m_endtype = 0;
		this.m_Childs = [];
		this.IsOpen = false;
	};

	ClipperLib.PolyNode.prototype.IsHoleNode = function ()
	{
		var result = true;
		var node = this.m_Parent;
		while (node !== null)
		{
			result = !result;
			node = node.m_Parent;
		}
		return result;
	};

	ClipperLib.PolyNode.prototype.ChildCount = function ()
	{
		return this.m_Childs.length;
	};

	ClipperLib.PolyNode.prototype.Contour = function ()
	{
		return this.m_polygon;
	};

	ClipperLib.PolyNode.prototype.AddChild = function (Child)
	{
		var cnt = this.m_Childs.length;
		this.m_Childs.push(Child);
		Child.m_Parent = this;
		Child.m_Index = cnt;
	};

	ClipperLib.PolyNode.prototype.GetNext = function ()
	{
		if (this.m_Childs.length > 0)
			return this.m_Childs[0];
		else
			return this.GetNextSiblingUp();
	};

	ClipperLib.PolyNode.prototype.GetNextSiblingUp = function ()
	{
		if (this.m_Parent === null)
			return null;
		else if (this.m_Index === this.m_Parent.m_Childs.length - 1)
			return this.m_Parent.GetNextSiblingUp();
		else
			return this.m_Parent.m_Childs[this.m_Index + 1];
	};

	ClipperLib.PolyNode.prototype.Childs = function ()
	{
		return this.m_Childs;
	};

	ClipperLib.PolyNode.prototype.Parent = function ()
	{
		return this.m_Parent;
	};

	ClipperLib.PolyNode.prototype.IsHole = function ()
	{
		return this.IsHoleNode();
	};

	// PolyTree : PolyNode
	/**
	 * @suppress {missingProperties}
	 * @constructor
	 */
	ClipperLib.PolyTree = function ()
	{
		this.m_AllPolys = [];
		ClipperLib.PolyNode.call(this);
	};

	ClipperLib.PolyTree.prototype.Clear = function ()
	{
		for (var i = 0, ilen = this.m_AllPolys.length; i < ilen; i++)
			this.m_AllPolys[i] = null;
		this.m_AllPolys.length = 0;
		this.m_Childs.length = 0;
	};

	ClipperLib.PolyTree.prototype.GetFirst = function ()
	{
		if (this.m_Childs.length > 0)
			return this.m_Childs[0];
		else
			return null;
	};

	ClipperLib.PolyTree.prototype.Total = function ()
	{
		var result = this.m_AllPolys.length;
		//with negative offsets, ignore the hidden outer polygon ...
		if (result > 0 && this.m_Childs[0] !== this.m_AllPolys[0]) result--;
		return result;
	};

	Inherit(ClipperLib.PolyTree, ClipperLib.PolyNode);

	// PolyTree & PolyNode end

	ClipperLib.Math_Abs_Int64 = ClipperLib.Math_Abs_Int32 = ClipperLib.Math_Abs_Double = function (a)
	{
		return Math.abs(a);
	};

	ClipperLib.Math_Max_Int32_Int32 = function (a, b)
	{
		return Math.max(a, b);
	};

	/*
	-----------------------------------
	cast_32 speedtest: http://jsperf.com/truncate-float-to-integer/2
	-----------------------------------
	*/
	if (browser.msie || browser.opera || browser.safari) ClipperLib.Cast_Int32 = function (a)
	{
		return a | 0;
	};

	else ClipperLib.Cast_Int32 = function (a)
	{ // eg. browser.chrome || browser.chromium || browser.firefox
		return ~~a;
	};

	/*
	--------------------------
	cast_64 speedtests: http://jsperf.com/truncate-float-to-integer
	Chrome: bitwise_not_floor
	Firefox17: toInteger (typeof test)
	IE9: bitwise_or_floor
	IE7 and IE8: to_parseint
	Chromium: to_floor_or_ceil
	Firefox3: to_floor_or_ceil
	Firefox15: to_floor_or_ceil
	Opera: to_floor_or_ceil
	Safari: to_floor_or_ceil
	--------------------------
	*/
	if (typeof Number.toInteger === "undefined")
		Number.toInteger = null;

	if (browser.chrome) ClipperLib.Cast_Int64 = function (a)
	{
		if (a < -2147483648 || a > 2147483647)
			return a < 0 ? Math.ceil(a) : Math.floor(a);
		else return ~~a;
	};

	else if (browser.firefox && typeof (Number.toInteger) === "function") ClipperLib.Cast_Int64 = function (a)
	{
		return Number.toInteger(a);
	};

	else if (browser.msie7 || browser.msie8) ClipperLib.Cast_Int64 = function (a)
	{
		return parseInt(a, 10);
	};

	else if (browser.msie) ClipperLib.Cast_Int64 = function (a)
	{
		if (a < -2147483648 || a > 2147483647)
			return a < 0 ? Math.ceil(a) : Math.floor(a);
		return a | 0;
	};

	// eg. browser.chromium || browser.firefox || browser.opera || browser.safari
	else ClipperLib.Cast_Int64 = function (a)
	{
		return a < 0 ? Math.ceil(a) : Math.floor(a);
	};

	ClipperLib.Clear = function (a)
	{
		a.length = 0;
	};

	//ClipperLib.MaxSteps = 64; // How many steps at maximum in arc in BuildArc() function
	ClipperLib.PI = 3.141592653589793;
	ClipperLib.PI2 = 2 * 3.141592653589793;
	/**
	* @constructor
	*/
	ClipperLib.IntPoint = function ()
	{
		var a = arguments,
			alen = a.length;
		this.X = 0;
		this.Y = 0;
		if (ClipperLib.use_xyz)
		{
			this.Z = 0;
			if (alen === 3) // public IntPoint(cInt x, cInt y, cInt z = 0)
			{
				this.X = a[0];
				this.Y = a[1];
				this.Z = a[2];
			}
			else if (alen === 2) // public IntPoint(cInt x, cInt y)
			{
				this.X = a[0];
				this.Y = a[1];
				this.Z = 0;
			}
			else if (alen === 1)
			{
				if (a[0] instanceof ClipperLib.DoublePoint) // public IntPoint(DoublePoint dp)
				{
					var dp = a[0];
					this.X = ClipperLib.Clipper.Round(dp.X);
					this.Y = ClipperLib.Clipper.Round(dp.Y);
					this.Z = 0;
				}
				else // public IntPoint(IntPoint pt)
				{
					var pt = a[0];
					if (typeof (pt.Z) === "undefined") pt.Z = 0;
					this.X = pt.X;
					this.Y = pt.Y;
					this.Z = pt.Z;
				}
			}
			else // public IntPoint()
			{
				this.X = 0;
				this.Y = 0;
				this.Z = 0;
			}
		}
		else // if (!ClipperLib.use_xyz)
		{
			if (alen === 2) // public IntPoint(cInt X, cInt Y)
			{
				this.X = a[0];
				this.Y = a[1];
			}
			else if (alen === 1)
			{
				if (a[0] instanceof ClipperLib.DoublePoint) // public IntPoint(DoublePoint dp)
				{
					var dp = a[0];
					this.X = ClipperLib.Clipper.Round(dp.X);
					this.Y = ClipperLib.Clipper.Round(dp.Y);
				}
				else // public IntPoint(IntPoint pt)
				{
					var pt = a[0];
					this.X = pt.X;
					this.Y = pt.Y;
				}
			}
			else // public IntPoint(IntPoint pt)
			{
				this.X = 0;
				this.Y = 0;
			}
		}
	};

	ClipperLib.IntPoint.op_Equality = function (a, b)
	{
		//return a == b;
		return a.X === b.X && a.Y === b.Y;
	};

	ClipperLib.IntPoint.op_Inequality = function (a, b)
	{
		//return a !== b;
		return a.X !== b.X || a.Y !== b.Y;
	};

	/*
  ClipperLib.IntPoint.prototype.Equals = function (obj)
  {
	if (obj === null)
		return false;
	if (obj instanceof ClipperLib.IntPoint)
	{
		var a = Cast(obj, ClipperLib.IntPoint);
		return (this.X == a.X) && (this.Y == a.Y);
	}
	else
		return false;
  };

	*/

	/**
	* @constructor
	*/
	ClipperLib.IntPoint0 = function ()
	{
		this.X = 0;
		this.Y = 0;
		if (ClipperLib.use_xyz)
			this.Z = 0;
	};

	ClipperLib.IntPoint0.prototype = ClipperLib.IntPoint.prototype;

	/**
	* @constructor
	*/
	ClipperLib.IntPoint1 = function (pt)
	{
		this.X = pt.X;
		this.Y = pt.Y;
		if (ClipperLib.use_xyz)
		{
			if (typeof pt.Z === "undefined") this.Z = 0;
			else this.Z = pt.Z;
		}
	};

	ClipperLib.IntPoint1.prototype = ClipperLib.IntPoint.prototype;

	/**
	* @constructor
	*/
	ClipperLib.IntPoint1dp = function (dp)
	{
		this.X = ClipperLib.Clipper.Round(dp.X);
		this.Y = ClipperLib.Clipper.Round(dp.Y);
		if (ClipperLib.use_xyz)
			this.Z = 0;
	};

	ClipperLib.IntPoint1dp.prototype = ClipperLib.IntPoint.prototype;

	/**
	* @constructor
	*/
	ClipperLib.IntPoint2 = function (x, y, z)
	{
		this.X = x;
		this.Y = y;
		if (ClipperLib.use_xyz)
		{
			if (typeof z === "undefined") this.Z = 0;
			else this.Z = z;
		}
	};

	ClipperLib.IntPoint2.prototype = ClipperLib.IntPoint.prototype;

	/**
	* @constructor
	*/
	ClipperLib.IntRect = function ()
	{
		var a = arguments,
			alen = a.length;
		if (alen === 4) // function (l, t, r, b)
		{
			this.left = a[0];
			this.top = a[1];
			this.right = a[2];
			this.bottom = a[3];
		}
		else if (alen === 1) // function (ir)
		{
			var ir = a[0];
			this.left = ir.left;
			this.top = ir.top;
			this.right = ir.right;
			this.bottom = ir.bottom;
		}
		else // function ()
		{
			this.left = 0;
			this.top = 0;
			this.right = 0;
			this.bottom = 0;
		}
	};

	/**
	* @constructor
	*/
	ClipperLib.IntRect0 = function ()
	{
		this.left = 0;
		this.top = 0;
		this.right = 0;
		this.bottom = 0;
	};

	ClipperLib.IntRect0.prototype = ClipperLib.IntRect.prototype;

	/**
	* @constructor
	*/
	ClipperLib.IntRect1 = function (ir)
	{
		this.left = ir.left;
		this.top = ir.top;
		this.right = ir.right;
		this.bottom = ir.bottom;
	};

	ClipperLib.IntRect1.prototype = ClipperLib.IntRect.prototype;

	/**
	* @constructor
	*/
	ClipperLib.IntRect4 = function (l, t, r, b)
	{
		this.left = l;
		this.top = t;
		this.right = r;
		this.bottom = b;
	};

	ClipperLib.IntRect4.prototype = ClipperLib.IntRect.prototype;

	ClipperLib.ClipType = {
		ctIntersection: 0,
		ctUnion: 1,
		ctDifference: 2,
		ctXor: 3
	};

	ClipperLib.PolyType = {
		ptSubject: 0,
		ptClip: 1
	};

	ClipperLib.PolyFillType = {
		pftEvenOdd: 0,
		pftNonZero: 1,
		pftPositive: 2,
		pftNegative: 3
	};

	ClipperLib.JoinType = {
		jtSquare: 0,
		jtRound: 1,
		jtMiter: 2
	};

	ClipperLib.EndType = {
		etOpenSquare: 0,
		etOpenRound: 1,
		etOpenButt: 2,
		etClosedLine: 3,
		etClosedPolygon: 4
	};

	ClipperLib.EdgeSide = {
		esLeft: 0,
		esRight: 1
	};

	ClipperLib.Direction = {
		dRightToLeft: 0,
		dLeftToRight: 1
	};

	/**
	* @constructor
	*/
	ClipperLib.TEdge = function ()
	{
		this.Bot = new ClipperLib.IntPoint0();
		this.Curr = new ClipperLib.IntPoint0(); //current (updated for every new scanbeam)
		this.Top = new ClipperLib.IntPoint0();
		this.Delta = new ClipperLib.IntPoint0();
		this.Dx = 0;
		this.PolyTyp = ClipperLib.PolyType.ptSubject;
		this.Side = ClipperLib.EdgeSide.esLeft; //side only refers to current side of solution poly
		this.WindDelta = 0; //1 or -1 depending on winding direction
		this.WindCnt = 0;
		this.WindCnt2 = 0; //winding count of the opposite polytype
		this.OutIdx = 0;
		this.Next = null;
		this.Prev = null;
		this.NextInLML = null;
		this.NextInAEL = null;
		this.PrevInAEL = null;
		this.NextInSEL = null;
		this.PrevInSEL = null;
	};

	/**
	* @constructor
	*/
	ClipperLib.IntersectNode = function ()
	{
		this.Edge1 = null;
		this.Edge2 = null;
		this.Pt = new ClipperLib.IntPoint0();
	};

	ClipperLib.MyIntersectNodeSort = function () {};

	ClipperLib.MyIntersectNodeSort.Compare = function (node1, node2)
	{
		var i = node2.Pt.Y - node1.Pt.Y;
		if (i > 0) return 1;
		else if (i < 0) return -1;
		else return 0;
	};

	/**
	* @constructor
	*/
	ClipperLib.LocalMinima = function ()
	{
		this.Y = 0;
		this.LeftBound = null;
		this.RightBound = null;
		this.Next = null;
	};

	/**
	* @constructor
	*/
	ClipperLib.Scanbeam = function ()
	{
		this.Y = 0;
		this.Next = null;
	};

	/**
	* @constructor
	*/
	ClipperLib.Maxima = function ()
	{
		this.X = 0;
		this.Next = null;
		this.Prev = null;
	};

	//OutRec: contains a path in the clipping solution. Edges in the AEL will
	//carry a pointer to an OutRec when they are part of the clipping solution.
	/**
	* @constructor
	*/
	ClipperLib.OutRec = function ()
	{
		this.Idx = 0;
		this.IsHole = false;
		this.IsOpen = false;
		this.FirstLeft = null; //see comments in clipper.pas
		this.Pts = null;
		this.BottomPt = null;
		this.PolyNode = null;
	};

	/**
	* @constructor
	*/
	ClipperLib.OutPt = function ()
	{
		this.Idx = 0;
		this.Pt = new ClipperLib.IntPoint0();
		this.Next = null;
		this.Prev = null;
	};

	/**
	* @constructor
	*/
	ClipperLib.Join = function ()
	{
		this.OutPt1 = null;
		this.OutPt2 = null;
		this.OffPt = new ClipperLib.IntPoint0();
	};

	ClipperLib.ClipperBase = function ()
	{
		this.m_MinimaList = null;
		this.m_CurrentLM = null;
		this.m_edges = new Array();
		this.m_UseFullRange = false;
		this.m_HasOpenPaths = false;
		this.PreserveCollinear = false;
		this.m_Scanbeam = null;
		this.m_PolyOuts = null;
		this.m_ActiveEdges = null;
	};

	// Ranges are in original C# too high for Javascript (in current state 2013 september):
	// protected const double horizontal = -3.4E+38;
	// internal const cInt loRange = 0x3FFFFFFF; // = 1073741823 = sqrt(2^63 -1)/2
	// internal const cInt hiRange = 0x3FFFFFFFFFFFFFFFL; // = 4611686018427387903 = sqrt(2^127 -1)/2
	// So had to adjust them to more suitable for Javascript.
	// If JS some day supports truly 64-bit integers, then these ranges can be as in C#
	// and biginteger library can be more simpler (as then 128bit can be represented as two 64bit numbers)
	ClipperLib.ClipperBase.horizontal = -9007199254740992; //-2^53
	ClipperLib.ClipperBase.Skip = -2;
	ClipperLib.ClipperBase.Unassigned = -1;
	ClipperLib.ClipperBase.tolerance = 1E-20;
	ClipperLib.ClipperBase.loRange = 47453132; // sqrt(2^53 -1)/2
	ClipperLib.ClipperBase.hiRange = 4503599627370495; // sqrt(2^106 -1)/2

	ClipperLib.ClipperBase.near_zero = function (val)
	{
		return (val > -ClipperLib.ClipperBase.tolerance) && (val < ClipperLib.ClipperBase.tolerance);
	};

	ClipperLib.ClipperBase.IsHorizontal = function (e)
	{
		return e.Delta.Y === 0;
	};

	ClipperLib.ClipperBase.prototype.PointIsVertex = function (pt, pp)
	{
		var pp2 = pp;
		do {
			if (ClipperLib.IntPoint.op_Equality(pp2.Pt, pt))
				return true;
			pp2 = pp2.Next;
		}
		while (pp2 !== pp)
		return false;
	};

	ClipperLib.ClipperBase.prototype.PointOnLineSegment = function (pt, linePt1, linePt2, UseFullRange)
	{
		if (UseFullRange)
			return ((pt.X === linePt1.X) && (pt.Y === linePt1.Y)) ||
				((pt.X === linePt2.X) && (pt.Y === linePt2.Y)) ||
				(((pt.X > linePt1.X) === (pt.X < linePt2.X)) &&
					((pt.Y > linePt1.Y) === (pt.Y < linePt2.Y)) &&
					(Int128.op_Equality(Int128.Int128Mul((pt.X - linePt1.X), (linePt2.Y - linePt1.Y)),
						Int128.Int128Mul((linePt2.X - linePt1.X), (pt.Y - linePt1.Y)))));
		else
			return ((pt.X === linePt1.X) && (pt.Y === linePt1.Y)) || ((pt.X === linePt2.X) && (pt.Y === linePt2.Y)) || (((pt.X > linePt1.X) === (pt.X < linePt2.X)) && ((pt.Y > linePt1.Y) === (pt.Y < linePt2.Y)) && ((pt.X - linePt1.X) * (linePt2.Y - linePt1.Y) === (linePt2.X - linePt1.X) * (pt.Y - linePt1.Y)));
	};

	ClipperLib.ClipperBase.prototype.PointOnPolygon = function (pt, pp, UseFullRange)
	{
		var pp2 = pp;
		while (true)
		{
			if (this.PointOnLineSegment(pt, pp2.Pt, pp2.Next.Pt, UseFullRange))
				return true;
			pp2 = pp2.Next;
			if (pp2 === pp)
				break;
		}
		return false;
	};

	ClipperLib.ClipperBase.prototype.SlopesEqual = ClipperLib.ClipperBase.SlopesEqual = function ()
	{
		var a = arguments,
			alen = a.length;
		var e1, e2, pt1, pt2, pt3, pt4, UseFullRange;
		if (alen === 3) // function (e1, e2, UseFullRange)
		{
			e1 = a[0];
			e2 = a[1];
			UseFullRange = a[2];
			if (UseFullRange)
				return Int128.op_Equality(Int128.Int128Mul(e1.Delta.Y, e2.Delta.X), Int128.Int128Mul(e1.Delta.X, e2.Delta.Y));
			else
				return ClipperLib.Cast_Int64((e1.Delta.Y) * (e2.Delta.X)) === ClipperLib.Cast_Int64((e1.Delta.X) * (e2.Delta.Y));
		}
		else if (alen === 4) // function (pt1, pt2, pt3, UseFullRange)
		{
			pt1 = a[0];
			pt2 = a[1];
			pt3 = a[2];
			UseFullRange = a[3];
			if (UseFullRange)
				return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt2.X - pt3.X), Int128.Int128Mul(pt1.X - pt2.X, pt2.Y - pt3.Y));
			else
				return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) === 0;
		}
		else // function (pt1, pt2, pt3, pt4, UseFullRange)
		{
			pt1 = a[0];
			pt2 = a[1];
			pt3 = a[2];
			pt4 = a[3];
			UseFullRange = a[4];
			if (UseFullRange)
				return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt3.X - pt4.X), Int128.Int128Mul(pt1.X - pt2.X, pt3.Y - pt4.Y));
			else
				return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt3.X - pt4.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt3.Y - pt4.Y)) === 0;
		}
	};

	ClipperLib.ClipperBase.SlopesEqual3 = function (e1, e2, UseFullRange)
	{
		if (UseFullRange)
			return Int128.op_Equality(Int128.Int128Mul(e1.Delta.Y, e2.Delta.X), Int128.Int128Mul(e1.Delta.X, e2.Delta.Y));
		else
			return ClipperLib.Cast_Int64((e1.Delta.Y) * (e2.Delta.X)) === ClipperLib.Cast_Int64((e1.Delta.X) * (e2.Delta.Y));
	};

	ClipperLib.ClipperBase.SlopesEqual4 = function (pt1, pt2, pt3, UseFullRange)
	{
		if (UseFullRange)
			return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt2.X - pt3.X), Int128.Int128Mul(pt1.X - pt2.X, pt2.Y - pt3.Y));
		else
			return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) === 0;
	};

	ClipperLib.ClipperBase.SlopesEqual5 = function (pt1, pt2, pt3, pt4, UseFullRange)
	{
		if (UseFullRange)
			return Int128.op_Equality(Int128.Int128Mul(pt1.Y - pt2.Y, pt3.X - pt4.X), Int128.Int128Mul(pt1.X - pt2.X, pt3.Y - pt4.Y));
		else
			return ClipperLib.Cast_Int64((pt1.Y - pt2.Y) * (pt3.X - pt4.X)) - ClipperLib.Cast_Int64((pt1.X - pt2.X) * (pt3.Y - pt4.Y)) === 0;
	};

	ClipperLib.ClipperBase.prototype.Clear = function ()
	{
		this.DisposeLocalMinimaList();
		for (var i = 0, ilen = this.m_edges.length; i < ilen; ++i)
		{
			for (var j = 0, jlen = this.m_edges[i].length; j < jlen; ++j)
				this.m_edges[i][j] = null;
			ClipperLib.Clear(this.m_edges[i]);
		}
		ClipperLib.Clear(this.m_edges);
		this.m_UseFullRange = false;
		this.m_HasOpenPaths = false;
	};

	ClipperLib.ClipperBase.prototype.DisposeLocalMinimaList = function ()
	{
		while (this.m_MinimaList !== null)
		{
			var tmpLm = this.m_MinimaList.Next;
			this.m_MinimaList = null;
			this.m_MinimaList = tmpLm;
		}
		this.m_CurrentLM = null;
	};

	ClipperLib.ClipperBase.prototype.RangeTest = function (Pt, useFullRange)
	{
		if (useFullRange.Value)
		{
			if (Pt.X > ClipperLib.ClipperBase.hiRange || Pt.Y > ClipperLib.ClipperBase.hiRange || -Pt.X > ClipperLib.ClipperBase.hiRange || -Pt.Y > ClipperLib.ClipperBase.hiRange)
				ClipperLib.Error("Coordinate outside allowed range in RangeTest().");
		}
		else if (Pt.X > ClipperLib.ClipperBase.loRange || Pt.Y > ClipperLib.ClipperBase.loRange || -Pt.X > ClipperLib.ClipperBase.loRange || -Pt.Y > ClipperLib.ClipperBase.loRange)
		{
			useFullRange.Value = true;
			this.RangeTest(Pt, useFullRange);
		}
	};

	ClipperLib.ClipperBase.prototype.InitEdge = function (e, eNext, ePrev, pt)
	{
		e.Next = eNext;
		e.Prev = ePrev;
		//e.Curr = pt;
		e.Curr.X = pt.X;
		e.Curr.Y = pt.Y;
		if (ClipperLib.use_xyz) e.Curr.Z = pt.Z;
		e.OutIdx = -1;
	};

	ClipperLib.ClipperBase.prototype.InitEdge2 = function (e, polyType)
	{
		if (e.Curr.Y >= e.Next.Curr.Y)
		{
			//e.Bot = e.Curr;
			e.Bot.X = e.Curr.X;
			e.Bot.Y = e.Curr.Y;
			if (ClipperLib.use_xyz) e.Bot.Z = e.Curr.Z;
			//e.Top = e.Next.Curr;
			e.Top.X = e.Next.Curr.X;
			e.Top.Y = e.Next.Curr.Y;
			if (ClipperLib.use_xyz) e.Top.Z = e.Next.Curr.Z;
		}
		else
		{
			//e.Top = e.Curr;
			e.Top.X = e.Curr.X;
			e.Top.Y = e.Curr.Y;
			if (ClipperLib.use_xyz) e.Top.Z = e.Curr.Z;
			//e.Bot = e.Next.Curr;
			e.Bot.X = e.Next.Curr.X;
			e.Bot.Y = e.Next.Curr.Y;
			if (ClipperLib.use_xyz) e.Bot.Z = e.Next.Curr.Z;
		}
		this.SetDx(e);
		e.PolyTyp = polyType;
	};

	ClipperLib.ClipperBase.prototype.FindNextLocMin = function (E)
	{
		var E2;
		for (;;)
		{
			while (ClipperLib.IntPoint.op_Inequality(E.Bot, E.Prev.Bot) || ClipperLib.IntPoint.op_Equality(E.Curr, E.Top))
				E = E.Next;
			if (E.Dx !== ClipperLib.ClipperBase.horizontal && E.Prev.Dx !== ClipperLib.ClipperBase.horizontal)
				break;
			while (E.Prev.Dx === ClipperLib.ClipperBase.horizontal)
				E = E.Prev;
			E2 = E;
			while (E.Dx === ClipperLib.ClipperBase.horizontal)
				E = E.Next;
			if (E.Top.Y === E.Prev.Bot.Y)
				continue;
			//ie just an intermediate horz.
			if (E2.Prev.Bot.X < E.Bot.X)
				E = E2;
			break;
		}
		return E;
	};

	ClipperLib.ClipperBase.prototype.ProcessBound = function (E, LeftBoundIsForward)
	{
		var EStart;
		var Result = E;
		var Horz;

		if (Result.OutIdx === ClipperLib.ClipperBase.Skip)
		{
			//check if there are edges beyond the skip edge in the bound and if so
			//create another LocMin and calling ProcessBound once more ...
			E = Result;
			if (LeftBoundIsForward)
			{
				while (E.Top.Y === E.Next.Bot.Y) E = E.Next;
				while (E !== Result && E.Dx === ClipperLib.ClipperBase.horizontal) E = E.Prev;
			}
			else
			{
				while (E.Top.Y === E.Prev.Bot.Y) E = E.Prev;
				while (E !== Result && E.Dx === ClipperLib.ClipperBase.horizontal) E = E.Next;
			}
			if (E === Result)
			{
				if (LeftBoundIsForward) Result = E.Next;
				else Result = E.Prev;
			}
			else
			{
				//there are more edges in the bound beyond result starting with E
				if (LeftBoundIsForward)
					E = Result.Next;
				else
					E = Result.Prev;
				var locMin = new ClipperLib.LocalMinima();
				locMin.Next = null;
				locMin.Y = E.Bot.Y;
				locMin.LeftBound = null;
				locMin.RightBound = E;
				E.WindDelta = 0;
				Result = this.ProcessBound(E, LeftBoundIsForward);
				this.InsertLocalMinima(locMin);
			}
			return Result;
		}

		if (E.Dx === ClipperLib.ClipperBase.horizontal)
		{
			//We need to be careful with open paths because this may not be a
			//true local minima (ie E may be following a skip edge).
			//Also, consecutive horz. edges may start heading left before going right.
			if (LeftBoundIsForward) EStart = E.Prev;
			else EStart = E.Next;

			if (EStart.Dx === ClipperLib.ClipperBase.horizontal) //ie an adjoining horizontal skip edge
			{
				if (EStart.Bot.X !== E.Bot.X && EStart.Top.X !== E.Bot.X)
					this.ReverseHorizontal(E);
			}
			else if (EStart.Bot.X !== E.Bot.X)
				this.ReverseHorizontal(E);
		}

		EStart = E;
		if (LeftBoundIsForward)
		{
			while (Result.Top.Y === Result.Next.Bot.Y && Result.Next.OutIdx !== ClipperLib.ClipperBase.Skip)
				Result = Result.Next;
			if (Result.Dx === ClipperLib.ClipperBase.horizontal && Result.Next.OutIdx !== ClipperLib.ClipperBase.Skip)
			{
				//nb: at the top of a bound, horizontals are added to the bound
				//only when the preceding edge attaches to the horizontal's left vertex
				//unless a Skip edge is encountered when that becomes the top divide
				Horz = Result;
				while (Horz.Prev.Dx === ClipperLib.ClipperBase.horizontal)
					Horz = Horz.Prev;
				if (Horz.Prev.Top.X > Result.Next.Top.X)
					Result = Horz.Prev;
			}
			while (E !== Result)
			{
				E.NextInLML = E.Next;
				if (E.Dx === ClipperLib.ClipperBase.horizontal && E !== EStart && E.Bot.X !== E.Prev.Top.X)
					this.ReverseHorizontal(E);
				E = E.Next;
			}
			if (E.Dx === ClipperLib.ClipperBase.horizontal && E !== EStart && E.Bot.X !== E.Prev.Top.X)
				this.ReverseHorizontal(E);
			Result = Result.Next;
			//move to the edge just beyond current bound
		}
		else
		{
			while (Result.Top.Y === Result.Prev.Bot.Y && Result.Prev.OutIdx !== ClipperLib.ClipperBase.Skip)
				Result = Result.Prev;
			if (Result.Dx === ClipperLib.ClipperBase.horizontal && Result.Prev.OutIdx !== ClipperLib.ClipperBase.Skip)
			{
				Horz = Result;
				while (Horz.Next.Dx === ClipperLib.ClipperBase.horizontal)
					Horz = Horz.Next;
				if (Horz.Next.Top.X === Result.Prev.Top.X || Horz.Next.Top.X > Result.Prev.Top.X)
				{
					Result = Horz.Next;
				}
			}
			while (E !== Result)
			{
				E.NextInLML = E.Prev;
				if (E.Dx === ClipperLib.ClipperBase.horizontal && E !== EStart && E.Bot.X !== E.Next.Top.X)
					this.ReverseHorizontal(E);
				E = E.Prev;
			}
			if (E.Dx === ClipperLib.ClipperBase.horizontal && E !== EStart && E.Bot.X !== E.Next.Top.X)
				this.ReverseHorizontal(E);
			Result = Result.Prev;
			//move to the edge just beyond current bound
		}

		return Result;
	};

	ClipperLib.ClipperBase.prototype.AddPath = function (pg, polyType, Closed)
	{
		if (ClipperLib.use_lines)
		{
			if (!Closed && polyType === ClipperLib.PolyType.ptClip)
				ClipperLib.Error("AddPath: Open paths must be subject.");
		}
		else
		{
			if (!Closed)
				ClipperLib.Error("AddPath: Open paths have been disabled.");
		}
		var highI = pg.length - 1;
		if (Closed)
			while (highI > 0 && (ClipperLib.IntPoint.op_Equality(pg[highI], pg[0])))
				--highI;
		while (highI > 0 && (ClipperLib.IntPoint.op_Equality(pg[highI], pg[highI - 1])))
			--highI;
		if ((Closed && highI < 2) || (!Closed && highI < 1))
			return false;
		//create a new edge array ...
		var edges = new Array();
		for (var i = 0; i <= highI; i++)
			edges.push(new ClipperLib.TEdge());
		var IsFlat = true;
		//1. Basic (first) edge initialization ...

		//edges[1].Curr = pg[1];
		edges[1].Curr.X = pg[1].X;
		edges[1].Curr.Y = pg[1].Y;
		if (ClipperLib.use_xyz) edges[1].Curr.Z = pg[1].Z;

		var $1 = {
			Value: this.m_UseFullRange
		};

		this.RangeTest(pg[0], $1);
		this.m_UseFullRange = $1.Value;

		$1.Value = this.m_UseFullRange;
		this.RangeTest(pg[highI], $1);
		this.m_UseFullRange = $1.Value;

		this.InitEdge(edges[0], edges[1], edges[highI], pg[0]);
		this.InitEdge(edges[highI], edges[0], edges[highI - 1], pg[highI]);
		for (var i = highI - 1; i >= 1; --i)
		{
			$1.Value = this.m_UseFullRange;
			this.RangeTest(pg[i], $1);
			this.m_UseFullRange = $1.Value;

			this.InitEdge(edges[i], edges[i + 1], edges[i - 1], pg[i]);
		}

		var eStart = edges[0];
		//2. Remove duplicate vertices, and (when closed) collinear edges ...
		var E = eStart,
			eLoopStop = eStart;
		for (;;)
		{
			//console.log(E.Next, eStart);
			//nb: allows matching start and end points when not Closed ...
			if (E.Curr === E.Next.Curr && (Closed || E.Next !== eStart))
			{
				if (E === E.Next)
					break;
				if (E === eStart)
					eStart = E.Next;
				E = this.RemoveEdge(E);
				eLoopStop = E;
				continue;
			}
			if (E.Prev === E.Next)
				break;
			else if (Closed && ClipperLib.ClipperBase.SlopesEqual4(E.Prev.Curr, E.Curr, E.Next.Curr, this.m_UseFullRange) && (!this.PreserveCollinear || !this.Pt2IsBetweenPt1AndPt3(E.Prev.Curr, E.Curr, E.Next.Curr)))
			{
				//Collinear edges are allowed for open paths but in closed paths
				//the default is to merge adjacent collinear edges into a single edge.
				//However, if the PreserveCollinear property is enabled, only overlapping
				//collinear edges (ie spikes) will be removed from closed paths.
				if (E === eStart)
					eStart = E.Next;
				E = this.RemoveEdge(E);
				E = E.Prev;
				eLoopStop = E;
				continue;
			}
			E = E.Next;
			if ((E === eLoopStop) || (!Closed && E.Next === eStart)) break;
		}
		if ((!Closed && (E === E.Next)) || (Closed && (E.Prev === E.Next)))
			return false;
		if (!Closed)
		{
			this.m_HasOpenPaths = true;
			eStart.Prev.OutIdx = ClipperLib.ClipperBase.Skip;
		}
		//3. Do second stage of edge initialization ...
		E = eStart;
		do {
			this.InitEdge2(E, polyType);
			E = E.Next;
			if (IsFlat && E.Curr.Y !== eStart.Curr.Y)
				IsFlat = false;
		}
		while (E !== eStart)
		//4. Finally, add edge bounds to LocalMinima list ...
		//Totally flat paths must be handled differently when adding them
		//to LocalMinima list to avoid endless loops etc ...
		if (IsFlat)
		{
			if (Closed)
				return false;

			E.Prev.OutIdx = ClipperLib.ClipperBase.Skip;

			var locMin = new ClipperLib.LocalMinima();
			locMin.Next = null;
			locMin.Y = E.Bot.Y;
			locMin.LeftBound = null;
			locMin.RightBound = E;
			locMin.RightBound.Side = ClipperLib.EdgeSide.esRight;
			locMin.RightBound.WindDelta = 0;

			for (;;)
			{
				if (E.Bot.X !== E.Prev.Top.X) this.ReverseHorizontal(E);
				if (E.Next.OutIdx === ClipperLib.ClipperBase.Skip) break;
				E.NextInLML = E.Next;
				E = E.Next;
			}
			this.InsertLocalMinima(locMin);
			this.m_edges.push(edges);
			return true;
		}
		this.m_edges.push(edges);
		var leftBoundIsForward;
		var EMin = null;

		//workaround to avoid an endless loop in the while loop below when
		//open paths have matching start and end points ...
		if (ClipperLib.IntPoint.op_Equality(E.Prev.Bot, E.Prev.Top))
			E = E.Next;

		for (;;)
		{
			E = this.FindNextLocMin(E);
			if (E === EMin)
				break;
			else if (EMin === null)
				EMin = E;
			//E and E.Prev now share a local minima (left aligned if horizontal).
			//Compare their slopes to find which starts which bound ...
			var locMin = new ClipperLib.LocalMinima();
			locMin.Next = null;
			locMin.Y = E.Bot.Y;
			if (E.Dx < E.Prev.Dx)
			{
				locMin.LeftBound = E.Prev;
				locMin.RightBound = E;
				leftBoundIsForward = false;
				//Q.nextInLML = Q.prev
			}
			else
			{
				locMin.LeftBound = E;
				locMin.RightBound = E.Prev;
				leftBoundIsForward = true;
				//Q.nextInLML = Q.next
			}
			locMin.LeftBound.Side = ClipperLib.EdgeSide.esLeft;
			locMin.RightBound.Side = ClipperLib.EdgeSide.esRight;
			if (!Closed)
				locMin.LeftBound.WindDelta = 0;
			else if (locMin.LeftBound.Next === locMin.RightBound)
				locMin.LeftBound.WindDelta = -1;
			else
				locMin.LeftBound.WindDelta = 1;
			locMin.RightBound.WindDelta = -locMin.LeftBound.WindDelta;
			E = this.ProcessBound(locMin.LeftBound, leftBoundIsForward);
			if (E.OutIdx === ClipperLib.ClipperBase.Skip)
				E = this.ProcessBound(E, leftBoundIsForward);
			var E2 = this.ProcessBound(locMin.RightBound, !leftBoundIsForward);
			if (E2.OutIdx === ClipperLib.ClipperBase.Skip) E2 = this.ProcessBound(E2, !leftBoundIsForward);
			if (locMin.LeftBound.OutIdx === ClipperLib.ClipperBase.Skip)
				locMin.LeftBound = null;
			else if (locMin.RightBound.OutIdx === ClipperLib.ClipperBase.Skip)
				locMin.RightBound = null;
			this.InsertLocalMinima(locMin);
			if (!leftBoundIsForward)
				E = E2;
		}
		return true;
	};

	ClipperLib.ClipperBase.prototype.AddPaths = function (ppg, polyType, closed)
	{
		//  console.log("-------------------------------------------");
		//  console.log(JSON.stringify(ppg));
		var result = false;
		for (var i = 0, ilen = ppg.length; i < ilen; ++i)
			if (this.AddPath(ppg[i], polyType, closed))
				result = true;
		return result;
	};

	ClipperLib.ClipperBase.prototype.Pt2IsBetweenPt1AndPt3 = function (pt1, pt2, pt3)
	{
		if ((ClipperLib.IntPoint.op_Equality(pt1, pt3)) || (ClipperLib.IntPoint.op_Equality(pt1, pt2)) || (ClipperLib.IntPoint.op_Equality(pt3, pt2)))

			//if ((pt1 == pt3) || (pt1 == pt2) || (pt3 == pt2))
			return false;

		else if (pt1.X !== pt3.X)
			return (pt2.X > pt1.X) === (pt2.X < pt3.X);
		else
			return (pt2.Y > pt1.Y) === (pt2.Y < pt3.Y);
	};

	ClipperLib.ClipperBase.prototype.RemoveEdge = function (e)
	{
		//removes e from double_linked_list (but without removing from memory)
		e.Prev.Next = e.Next;
		e.Next.Prev = e.Prev;
		var result = e.Next;
		e.Prev = null; //flag as removed (see ClipperBase.Clear)
		return result;
	};

	ClipperLib.ClipperBase.prototype.SetDx = function (e)
	{
		e.Delta.X = (e.Top.X - e.Bot.X);
		e.Delta.Y = (e.Top.Y - e.Bot.Y);
		if (e.Delta.Y === 0) e.Dx = ClipperLib.ClipperBase.horizontal;
		else e.Dx = (e.Delta.X) / (e.Delta.Y);
	};

	ClipperLib.ClipperBase.prototype.InsertLocalMinima = function (newLm)
	{
		if (this.m_MinimaList === null)
		{
			this.m_MinimaList = newLm;
		}
		else if (newLm.Y >= this.m_MinimaList.Y)
		{
			newLm.Next = this.m_MinimaList;
			this.m_MinimaList = newLm;
		}
		else
		{
			var tmpLm = this.m_MinimaList;
			while (tmpLm.Next !== null && (newLm.Y < tmpLm.Next.Y))
				tmpLm = tmpLm.Next;
			newLm.Next = tmpLm.Next;
			tmpLm.Next = newLm;
		}
	};

	ClipperLib.ClipperBase.prototype.PopLocalMinima = function (Y, current)
	{
		current.v = this.m_CurrentLM;
		if (this.m_CurrentLM !== null && this.m_CurrentLM.Y === Y)
		{
			this.m_CurrentLM = this.m_CurrentLM.Next;
			return true;
		}
		return false;
	};

	ClipperLib.ClipperBase.prototype.ReverseHorizontal = function (e)
	{
		//swap horizontal edges' top and bottom x's so they follow the natural
		//progression of the bounds - ie so their xbots will align with the
		//adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
		var tmp = e.Top.X;
		e.Top.X = e.Bot.X;
		e.Bot.X = tmp;
		if (ClipperLib.use_xyz)
		{
			tmp = e.Top.Z;
			e.Top.Z = e.Bot.Z;
			e.Bot.Z = tmp;
		}
	};

	ClipperLib.ClipperBase.prototype.Reset = function ()
	{
		this.m_CurrentLM = this.m_MinimaList;
		if (this.m_CurrentLM === null) //ie nothing to process
			return;
		//reset all edges ...
		this.m_Scanbeam = null;
		var lm = this.m_MinimaList;
		while (lm !== null)
		{
			this.InsertScanbeam(lm.Y);
			var e = lm.LeftBound;
			if (e !== null)
			{
				//e.Curr = e.Bot;
				e.Curr.X = e.Bot.X;
				e.Curr.Y = e.Bot.Y;
				if (ClipperLib.use_xyz) e.Curr.Z = e.Bot.Z;
				e.OutIdx = ClipperLib.ClipperBase.Unassigned;
			}
			e = lm.RightBound;
			if (e !== null)
			{
				//e.Curr = e.Bot;
				e.Curr.X = e.Bot.X;
				e.Curr.Y = e.Bot.Y;
				if (ClipperLib.use_xyz) e.Curr.Z = e.Bot.Z;
				e.OutIdx = ClipperLib.ClipperBase.Unassigned;
			}
			lm = lm.Next;
		}
		this.m_ActiveEdges = null;
	};

	ClipperLib.ClipperBase.prototype.InsertScanbeam = function (Y)
	{
		//single-linked list: sorted descending, ignoring dups.
		if (this.m_Scanbeam === null)
		{
			this.m_Scanbeam = new ClipperLib.Scanbeam();
			this.m_Scanbeam.Next = null;
			this.m_Scanbeam.Y = Y;
		}
		else if (Y > this.m_Scanbeam.Y)
		{
			var newSb = new ClipperLib.Scanbeam();
			newSb.Y = Y;
			newSb.Next = this.m_Scanbeam;
			this.m_Scanbeam = newSb;
		}
		else
		{
			var sb2 = this.m_Scanbeam;
			while (sb2.Next !== null && Y <= sb2.Next.Y)
			{
				sb2 = sb2.Next;
			}
			if (Y === sb2.Y)
			{
				return;
			} //ie ignores duplicates
			var newSb1 = new ClipperLib.Scanbeam();
			newSb1.Y = Y;
			newSb1.Next = sb2.Next;
			sb2.Next = newSb1;
		}
	};

	ClipperLib.ClipperBase.prototype.PopScanbeam = function (Y)
	{
		if (this.m_Scanbeam === null)
		{
			Y.v = 0;
			return false;
		}
		Y.v = this.m_Scanbeam.Y;
		this.m_Scanbeam = this.m_Scanbeam.Next;
		return true;
	};

	ClipperLib.ClipperBase.prototype.LocalMinimaPending = function ()
	{
		return (this.m_CurrentLM !== null);
	};

	ClipperLib.ClipperBase.prototype.CreateOutRec = function ()
	{
		var result = new ClipperLib.OutRec();
		result.Idx = ClipperLib.ClipperBase.Unassigned;
		result.IsHole = false;
		result.IsOpen = false;
		result.FirstLeft = null;
		result.Pts = null;
		result.BottomPt = null;
		result.PolyNode = null;
		this.m_PolyOuts.push(result);
		result.Idx = this.m_PolyOuts.length - 1;
		return result;
	};

	ClipperLib.ClipperBase.prototype.DisposeOutRec = function (index)
	{
		var outRec = this.m_PolyOuts[index];
		outRec.Pts = null;
		outRec = null;
		this.m_PolyOuts[index] = null;
	};

	ClipperLib.ClipperBase.prototype.UpdateEdgeIntoAEL = function (e)
	{
		if (e.NextInLML === null)
		{
			ClipperLib.Error("UpdateEdgeIntoAEL: invalid call");
		}
		var AelPrev = e.PrevInAEL;
		var AelNext = e.NextInAEL;
		e.NextInLML.OutIdx = e.OutIdx;
		if (AelPrev !== null)
		{
			AelPrev.NextInAEL = e.NextInLML;
		}
		else
		{
			this.m_ActiveEdges = e.NextInLML;
		}
		if (AelNext !== null)
		{
			AelNext.PrevInAEL = e.NextInLML;
		}
		e.NextInLML.Side = e.Side;
		e.NextInLML.WindDelta = e.WindDelta;
		e.NextInLML.WindCnt = e.WindCnt;
		e.NextInLML.WindCnt2 = e.WindCnt2;
		e = e.NextInLML;
		e.Curr.X = e.Bot.X;
		e.Curr.Y = e.Bot.Y;
		e.PrevInAEL = AelPrev;
		e.NextInAEL = AelNext;
		if (!ClipperLib.ClipperBase.IsHorizontal(e))
		{
			this.InsertScanbeam(e.Top.Y);
		}
		return e;
	};

	ClipperLib.ClipperBase.prototype.SwapPositionsInAEL = function (edge1, edge2)
	{
		//check that one or other edge hasn't already been removed from AEL ...
		if (edge1.NextInAEL === edge1.PrevInAEL || edge2.NextInAEL === edge2.PrevInAEL)
		{
			return;
		}

		if (edge1.NextInAEL === edge2)
		{
			var next = edge2.NextInAEL;
			if (next !== null)
			{
				next.PrevInAEL = edge1;
			}
			var prev = edge1.PrevInAEL;
			if (prev !== null)
			{
				prev.NextInAEL = edge2;
			}
			edge2.PrevInAEL = prev;
			edge2.NextInAEL = edge1;
			edge1.PrevInAEL = edge2;
			edge1.NextInAEL = next;
		}
		else if (edge2.NextInAEL === edge1)
		{
			var next1 = edge1.NextInAEL;
			if (next1 !== null)
			{
				next1.PrevInAEL = edge2;
			}
			var prev1 = edge2.PrevInAEL;
			if (prev1 !== null)
			{
				prev1.NextInAEL = edge1;
			}
			edge1.PrevInAEL = prev1;
			edge1.NextInAEL = edge2;
			edge2.PrevInAEL = edge1;
			edge2.NextInAEL = next1;
		}
		else
		{
			var next2 = edge1.NextInAEL;
			var prev2 = edge1.PrevInAEL;
			edge1.NextInAEL = edge2.NextInAEL;
			if (edge1.NextInAEL !== null)
			{
				edge1.NextInAEL.PrevInAEL = edge1;
			}
			edge1.PrevInAEL = edge2.PrevInAEL;
			if (edge1.PrevInAEL !== null)
			{
				edge1.PrevInAEL.NextInAEL = edge1;
			}
			edge2.NextInAEL = next2;
			if (edge2.NextInAEL !== null)
			{
				edge2.NextInAEL.PrevInAEL = edge2;
			}
			edge2.PrevInAEL = prev2;
			if (edge2.PrevInAEL !== null)
			{
				edge2.PrevInAEL.NextInAEL = edge2;
			}
		}

		if (edge1.PrevInAEL === null)
		{
			this.m_ActiveEdges = edge1;
		}
		else
		{
			if (edge2.PrevInAEL === null)
			{
				this.m_ActiveEdges = edge2;
			}
		}
	};

	ClipperLib.ClipperBase.prototype.DeleteFromAEL = function (e)
	{
		var AelPrev = e.PrevInAEL;
		var AelNext = e.NextInAEL;
		if (AelPrev === null && AelNext === null && e !== this.m_ActiveEdges)
		{
			return;
		} //already deleted
		if (AelPrev !== null)
		{
			AelPrev.NextInAEL = AelNext;
		}
		else
		{
			this.m_ActiveEdges = AelNext;
		}
		if (AelNext !== null)
		{
			AelNext.PrevInAEL = AelPrev;
		}
		e.NextInAEL = null;
		e.PrevInAEL = null;
	}

	// public Clipper(int InitOptions = 0)
	/**
	 * @suppress {missingProperties}
	 */
	ClipperLib.Clipper = function (InitOptions)
	{
		if (typeof (InitOptions) === "undefined") InitOptions = 0;
		this.m_PolyOuts = null;
		this.m_ClipType = ClipperLib.ClipType.ctIntersection;
		this.m_Scanbeam = null;
		this.m_Maxima = null;
		this.m_ActiveEdges = null;
		this.m_SortedEdges = null;
		this.m_IntersectList = null;
		this.m_IntersectNodeComparer = null;
		this.m_ExecuteLocked = false;
		this.m_ClipFillType = ClipperLib.PolyFillType.pftEvenOdd;
		this.m_SubjFillType = ClipperLib.PolyFillType.pftEvenOdd;
		this.m_Joins = null;
		this.m_GhostJoins = null;
		this.m_UsingPolyTree = false;
		this.ReverseSolution = false;
		this.StrictlySimple = false;

		ClipperLib.ClipperBase.call(this);

		this.m_Scanbeam = null;
		this.m_Maxima = null;
		this.m_ActiveEdges = null;
		this.m_SortedEdges = null;
		this.m_IntersectList = new Array();
		this.m_IntersectNodeComparer = ClipperLib.MyIntersectNodeSort.Compare;
		this.m_ExecuteLocked = false;
		this.m_UsingPolyTree = false;
		this.m_PolyOuts = new Array();
		this.m_Joins = new Array();
		this.m_GhostJoins = new Array();
		this.ReverseSolution = (1 & InitOptions) !== 0;
		this.StrictlySimple = (2 & InitOptions) !== 0;
		this.PreserveCollinear = (4 & InitOptions) !== 0;
		if (ClipperLib.use_xyz)
		{
			this.ZFillFunction = null; // function (IntPoint vert1, IntPoint vert2, ref IntPoint intersectPt);
		}
	};

	ClipperLib.Clipper.ioReverseSolution = 1;
	ClipperLib.Clipper.ioStrictlySimple = 2;
	ClipperLib.Clipper.ioPreserveCollinear = 4;

	ClipperLib.Clipper.prototype.Clear = function ()
	{
		if (this.m_edges.length === 0)
			return;
		//avoids problems with ClipperBase destructor
		this.DisposeAllPolyPts();
		ClipperLib.ClipperBase.prototype.Clear.call(this);
	};

	ClipperLib.Clipper.prototype.InsertMaxima = function (X)
	{
		//double-linked list: sorted ascending, ignoring dups.
		var newMax = new ClipperLib.Maxima();
		newMax.X = X;
		if (this.m_Maxima === null)
		{
			this.m_Maxima = newMax;
			this.m_Maxima.Next = null;
			this.m_Maxima.Prev = null;
		}
		else if (X < this.m_Maxima.X)
		{
			newMax.Next = this.m_Maxima;
			newMax.Prev = null;
			this.m_Maxima = newMax;
		}
		else
		{
			var m = this.m_Maxima;
			while (m.Next !== null && X >= m.Next.X)
			{
				m = m.Next;
			}
			if (X === m.X)
			{
				return;
			} //ie ignores duplicates (& CG to clean up newMax)
			//insert newMax between m and m.Next ...
			newMax.Next = m.Next;
			newMax.Prev = m;
			if (m.Next !== null)
			{
				m.Next.Prev = newMax;
			}
			m.Next = newMax;
		}
	};

	// ************************************
	ClipperLib.Clipper.prototype.Execute = function ()
	{
		var a = arguments,
			alen = a.length,
			ispolytree = a[1] instanceof ClipperLib.PolyTree;
		if (alen === 4 && !ispolytree) // function (clipType, solution, subjFillType, clipFillType)
		{
			var clipType = a[0],
				solution = a[1],
				subjFillType = a[2],
				clipFillType = a[3];
			if (this.m_ExecuteLocked)
				return false;
			if (this.m_HasOpenPaths)
				ClipperLib.Error("Error: PolyTree struct is needed for open path clipping.");
			this.m_ExecuteLocked = true;
			ClipperLib.Clear(solution);
			this.m_SubjFillType = subjFillType;
			this.m_ClipFillType = clipFillType;
			this.m_ClipType = clipType;
			this.m_UsingPolyTree = false;
			try
			{
				var succeeded = this.ExecuteInternal();
				//build the return polygons ...
				if (succeeded) this.BuildResult(solution);
			}
			finally
			{
				this.DisposeAllPolyPts();
				this.m_ExecuteLocked = false;
			}
			return succeeded;
		}
		else if (alen === 4 && ispolytree) // function (clipType, polytree, subjFillType, clipFillType)
		{
			var clipType = a[0],
				polytree = a[1],
				subjFillType = a[2],
				clipFillType = a[3];
			if (this.m_ExecuteLocked)
				return false;
			this.m_ExecuteLocked = true;
			this.m_SubjFillType = subjFillType;
			this.m_ClipFillType = clipFillType;
			this.m_ClipType = clipType;
			this.m_UsingPolyTree = true;
			try
			{
				var succeeded = this.ExecuteInternal();
				//build the return polygons ...
				if (succeeded) this.BuildResult2(polytree);
			}
			finally
			{
				this.DisposeAllPolyPts();
				this.m_ExecuteLocked = false;
			}
			return succeeded;
		}
		else if (alen === 2 && !ispolytree) // function (clipType, solution)
		{
			var clipType = a[0],
				solution = a[1];
			return this.Execute(clipType, solution, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
		}
		else if (alen === 2 && ispolytree) // function (clipType, polytree)
		{
			var clipType = a[0],
				polytree = a[1];
			return this.Execute(clipType, polytree, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
		}
	};

	ClipperLib.Clipper.prototype.FixHoleLinkage = function (outRec)
	{
		//skip if an outermost polygon or
		//already already points to the correct FirstLeft ...
		if (outRec.FirstLeft === null || (outRec.IsHole !== outRec.FirstLeft.IsHole && outRec.FirstLeft.Pts !== null))
			return;
		var orfl = outRec.FirstLeft;
		while (orfl !== null && ((orfl.IsHole === outRec.IsHole) || orfl.Pts === null))
			orfl = orfl.FirstLeft;
		outRec.FirstLeft = orfl;
	};

	ClipperLib.Clipper.prototype.ExecuteInternal = function ()
	{
		try
		{
			this.Reset();
			this.m_SortedEdges = null;
			this.m_Maxima = null;

			var botY = {},
				topY = {};

			if (!this.PopScanbeam(botY))
			{
				return false;
			}
			this.InsertLocalMinimaIntoAEL(botY.v);
			while (this.PopScanbeam(topY) || this.LocalMinimaPending())
			{
				this.ProcessHorizontals();
				this.m_GhostJoins.length = 0;
				if (!this.ProcessIntersections(topY.v))
				{
					return false;
				}
				this.ProcessEdgesAtTopOfScanbeam(topY.v);
				botY.v = topY.v;
				this.InsertLocalMinimaIntoAEL(botY.v);
			}

			//fix orientations ...
			var outRec, i, ilen;
			//fix orientations ...
			for (i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
			{
				outRec = this.m_PolyOuts[i];
				if (outRec.Pts === null || outRec.IsOpen) continue;
				if ((outRec.IsHole ^ this.ReverseSolution) == (this.Area$1(outRec) > 0))
					this.ReversePolyPtLinks(outRec.Pts);
			}

			this.JoinCommonEdges();

			for (i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
			{
				outRec = this.m_PolyOuts[i];
				if (outRec.Pts === null)
					continue;
				else if (outRec.IsOpen)
					this.FixupOutPolyline(outRec);
				else
					this.FixupOutPolygon(outRec);
			}

			if (this.StrictlySimple) this.DoSimplePolygons();
			return true;
		}
		//catch { return false; }
		finally
		{
			this.m_Joins.length = 0;
			this.m_GhostJoins.length = 0;
		}
	};

	ClipperLib.Clipper.prototype.DisposeAllPolyPts = function ()
	{
		for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; ++i)
			this.DisposeOutRec(i);
		ClipperLib.Clear(this.m_PolyOuts);
	};

	ClipperLib.Clipper.prototype.AddJoin = function (Op1, Op2, OffPt)
	{
		var j = new ClipperLib.Join();
		j.OutPt1 = Op1;
		j.OutPt2 = Op2;
		//j.OffPt = OffPt;
		j.OffPt.X = OffPt.X;
		j.OffPt.Y = OffPt.Y;
		if (ClipperLib.use_xyz) j.OffPt.Z = OffPt.Z;
		this.m_Joins.push(j);
	};

	ClipperLib.Clipper.prototype.AddGhostJoin = function (Op, OffPt)
	{
		var j = new ClipperLib.Join();
		j.OutPt1 = Op;
		//j.OffPt = OffPt;
		j.OffPt.X = OffPt.X;
		j.OffPt.Y = OffPt.Y;
		if (ClipperLib.use_xyz) j.OffPt.Z = OffPt.Z;
		this.m_GhostJoins.push(j);
	};

	//if (ClipperLib.use_xyz)
	//{
	ClipperLib.Clipper.prototype.SetZ = function (pt, e1, e2)
	{
		if (this.ZFillFunction !== null)
		{
			if (pt.Z !== 0 || this.ZFillFunction === null) return;
			else if (ClipperLib.IntPoint.op_Equality(pt, e1.Bot)) pt.Z = e1.Bot.Z;
			else if (ClipperLib.IntPoint.op_Equality(pt, e1.Top)) pt.Z = e1.Top.Z;
			else if (ClipperLib.IntPoint.op_Equality(pt, e2.Bot)) pt.Z = e2.Bot.Z;
			else if (ClipperLib.IntPoint.op_Equality(pt, e2.Top)) pt.Z = e2.Top.Z;
			else this.ZFillFunction(e1.Bot, e1.Top, e2.Bot, e2.Top, pt);
		}
	};
	//}

	ClipperLib.Clipper.prototype.InsertLocalMinimaIntoAEL = function (botY)
	{
		var lm = {};

		var lb;
		var rb;
		while (this.PopLocalMinima(botY, lm))
		{
			lb = lm.v.LeftBound;
			rb = lm.v.RightBound;

			var Op1 = null;
			if (lb === null)
			{
				this.InsertEdgeIntoAEL(rb, null);
				this.SetWindingCount(rb);
				if (this.IsContributing(rb))
					Op1 = this.AddOutPt(rb, rb.Bot);
			}
			else if (rb === null)
			{
				this.InsertEdgeIntoAEL(lb, null);
				this.SetWindingCount(lb);
				if (this.IsContributing(lb))
					Op1 = this.AddOutPt(lb, lb.Bot);
				this.InsertScanbeam(lb.Top.Y);
			}
			else
			{
				this.InsertEdgeIntoAEL(lb, null);
				this.InsertEdgeIntoAEL(rb, lb);
				this.SetWindingCount(lb);
				rb.WindCnt = lb.WindCnt;
				rb.WindCnt2 = lb.WindCnt2;
				if (this.IsContributing(lb))
					Op1 = this.AddLocalMinPoly(lb, rb, lb.Bot);
				this.InsertScanbeam(lb.Top.Y);
			}
			if (rb !== null)
			{
				if (ClipperLib.ClipperBase.IsHorizontal(rb))
				{
					if (rb.NextInLML !== null)
					{
						this.InsertScanbeam(rb.NextInLML.Top.Y);
					}
					this.AddEdgeToSEL(rb);
				}
				else
				{
					this.InsertScanbeam(rb.Top.Y);
				}
			}
			if (lb === null || rb === null) continue;
			//if output polygons share an Edge with a horizontal rb, they'll need joining later ...
			if (Op1 !== null && ClipperLib.ClipperBase.IsHorizontal(rb) && this.m_GhostJoins.length > 0 && rb.WindDelta !== 0)
			{
				for (var i = 0, ilen = this.m_GhostJoins.length; i < ilen; i++)
				{
					//if the horizontal Rb and a 'ghost' horizontal overlap, then convert
					//the 'ghost' join to a real join ready for later ...
					var j = this.m_GhostJoins[i];

					if (this.HorzSegmentsOverlap(j.OutPt1.Pt.X, j.OffPt.X, rb.Bot.X, rb.Top.X))
						this.AddJoin(j.OutPt1, Op1, j.OffPt);
				}
			}

			if (lb.OutIdx >= 0 && lb.PrevInAEL !== null &&
				lb.PrevInAEL.Curr.X === lb.Bot.X &&
				lb.PrevInAEL.OutIdx >= 0 &&
				ClipperLib.ClipperBase.SlopesEqual5(lb.PrevInAEL.Curr, lb.PrevInAEL.Top, lb.Curr, lb.Top, this.m_UseFullRange) &&
				lb.WindDelta !== 0 && lb.PrevInAEL.WindDelta !== 0)
			{
				var Op2 = this.AddOutPt(lb.PrevInAEL, lb.Bot);
				this.AddJoin(Op1, Op2, lb.Top);
			}
			if (lb.NextInAEL !== rb)
			{
				if (rb.OutIdx >= 0 && rb.PrevInAEL.OutIdx >= 0 &&
					ClipperLib.ClipperBase.SlopesEqual5(rb.PrevInAEL.Curr, rb.PrevInAEL.Top, rb.Curr, rb.Top, this.m_UseFullRange) &&
					rb.WindDelta !== 0 && rb.PrevInAEL.WindDelta !== 0)
				{
					var Op2 = this.AddOutPt(rb.PrevInAEL, rb.Bot);
					this.AddJoin(Op1, Op2, rb.Top);
				}
				var e = lb.NextInAEL;
				if (e !== null)
					while (e !== rb)
					{
						//nb: For calculating winding counts etc, IntersectEdges() assumes
						//that param1 will be to the right of param2 ABOVE the intersection ...
						this.IntersectEdges(rb, e, lb.Curr);
						//order important here
						e = e.NextInAEL;
					}
			}
		}
	};

	ClipperLib.Clipper.prototype.InsertEdgeIntoAEL = function (edge, startEdge)
	{
		if (this.m_ActiveEdges === null)
		{
			edge.PrevInAEL = null;
			edge.NextInAEL = null;
			this.m_ActiveEdges = edge;
		}
		else if (startEdge === null && this.E2InsertsBeforeE1(this.m_ActiveEdges, edge))
		{
			edge.PrevInAEL = null;
			edge.NextInAEL = this.m_ActiveEdges;
			this.m_ActiveEdges.PrevInAEL = edge;
			this.m_ActiveEdges = edge;
		}
		else
		{
			if (startEdge === null)
				startEdge = this.m_ActiveEdges;
			while (startEdge.NextInAEL !== null && !this.E2InsertsBeforeE1(startEdge.NextInAEL, edge))
				startEdge = startEdge.NextInAEL;
			edge.NextInAEL = startEdge.NextInAEL;
			if (startEdge.NextInAEL !== null)
				startEdge.NextInAEL.PrevInAEL = edge;
			edge.PrevInAEL = startEdge;
			startEdge.NextInAEL = edge;
		}
	};

	ClipperLib.Clipper.prototype.E2InsertsBeforeE1 = function (e1, e2)
	{
		if (e2.Curr.X === e1.Curr.X)
		{
			if (e2.Top.Y > e1.Top.Y)
				return e2.Top.X < ClipperLib.Clipper.TopX(e1, e2.Top.Y);
			else
				return e1.Top.X > ClipperLib.Clipper.TopX(e2, e1.Top.Y);
		}
		else
			return e2.Curr.X < e1.Curr.X;
	};

	ClipperLib.Clipper.prototype.IsEvenOddFillType = function (edge)
	{
		if (edge.PolyTyp === ClipperLib.PolyType.ptSubject)
			return this.m_SubjFillType === ClipperLib.PolyFillType.pftEvenOdd;
		else
			return this.m_ClipFillType === ClipperLib.PolyFillType.pftEvenOdd;
	};

	ClipperLib.Clipper.prototype.IsEvenOddAltFillType = function (edge)
	{
		if (edge.PolyTyp === ClipperLib.PolyType.ptSubject)
			return this.m_ClipFillType === ClipperLib.PolyFillType.pftEvenOdd;
		else
			return this.m_SubjFillType === ClipperLib.PolyFillType.pftEvenOdd;
	};

	ClipperLib.Clipper.prototype.IsContributing = function (edge)
	{
		var pft, pft2;
		if (edge.PolyTyp === ClipperLib.PolyType.ptSubject)
		{
			pft = this.m_SubjFillType;
			pft2 = this.m_ClipFillType;
		}
		else
		{
			pft = this.m_ClipFillType;
			pft2 = this.m_SubjFillType;
		}
		switch (pft)
		{
		case ClipperLib.PolyFillType.pftEvenOdd:
			if (edge.WindDelta === 0 && edge.WindCnt !== 1)
				return false;
			break;
		case ClipperLib.PolyFillType.pftNonZero:
			if (Math.abs(edge.WindCnt) !== 1)
				return false;
			break;
		case ClipperLib.PolyFillType.pftPositive:
			if (edge.WindCnt !== 1)
				return false;
			break;
		default:
			if (edge.WindCnt !== -1)
				return false;
			break;
		}
		switch (this.m_ClipType)
		{
		case ClipperLib.ClipType.ctIntersection:
			switch (pft2)
			{
			case ClipperLib.PolyFillType.pftEvenOdd:
			case ClipperLib.PolyFillType.pftNonZero:
				return (edge.WindCnt2 !== 0);
			case ClipperLib.PolyFillType.pftPositive:
				return (edge.WindCnt2 > 0);
			default:
				return (edge.WindCnt2 < 0);
			}
		case ClipperLib.ClipType.ctUnion:
			switch (pft2)
			{
			case ClipperLib.PolyFillType.pftEvenOdd:
			case ClipperLib.PolyFillType.pftNonZero:
				return (edge.WindCnt2 === 0);
			case ClipperLib.PolyFillType.pftPositive:
				return (edge.WindCnt2 <= 0);
			default:
				return (edge.WindCnt2 >= 0);
			}
		case ClipperLib.ClipType.ctDifference:
			if (edge.PolyTyp === ClipperLib.PolyType.ptSubject)
				switch (pft2)
				{
				case ClipperLib.PolyFillType.pftEvenOdd:
				case ClipperLib.PolyFillType.pftNonZero:
					return (edge.WindCnt2 === 0);
				case ClipperLib.PolyFillType.pftPositive:
					return (edge.WindCnt2 <= 0);
				default:
					return (edge.WindCnt2 >= 0);
				}
			else
				switch (pft2)
				{
				case ClipperLib.PolyFillType.pftEvenOdd:
				case ClipperLib.PolyFillType.pftNonZero:
					return (edge.WindCnt2 !== 0);
				case ClipperLib.PolyFillType.pftPositive:
					return (edge.WindCnt2 > 0);
				default:
					return (edge.WindCnt2 < 0);
				}
		case ClipperLib.ClipType.ctXor:
			if (edge.WindDelta === 0)
				switch (pft2)
				{
				case ClipperLib.PolyFillType.pftEvenOdd:
				case ClipperLib.PolyFillType.pftNonZero:
					return (edge.WindCnt2 === 0);
				case ClipperLib.PolyFillType.pftPositive:
					return (edge.WindCnt2 <= 0);
				default:
					return (edge.WindCnt2 >= 0);
				}
			else
				return true;
		}
		return true;
	};

	ClipperLib.Clipper.prototype.SetWindingCount = function (edge)
	{
		var e = edge.PrevInAEL;
		//find the edge of the same polytype that immediately preceeds 'edge' in AEL
		while (e !== null && ((e.PolyTyp !== edge.PolyTyp) || (e.WindDelta === 0)))
			e = e.PrevInAEL;
		if (e === null)
		{
			var pft = (edge.PolyTyp === ClipperLib.PolyType.ptSubject ? this.m_SubjFillType : this.m_ClipFillType);
			if (edge.WindDelta === 0)
			{
				edge.WindCnt = (pft === ClipperLib.PolyFillType.pftNegative ? -1 : 1);
			}
			else
			{
				edge.WindCnt = edge.WindDelta;
			}
			edge.WindCnt2 = 0;
			e = this.m_ActiveEdges;
			//ie get ready to calc WindCnt2
		}
		else if (edge.WindDelta === 0 && this.m_ClipType !== ClipperLib.ClipType.ctUnion)
		{
			edge.WindCnt = 1;
			edge.WindCnt2 = e.WindCnt2;
			e = e.NextInAEL;
			//ie get ready to calc WindCnt2
		}
		else if (this.IsEvenOddFillType(edge))
		{
			//EvenOdd filling ...
			if (edge.WindDelta === 0)
			{
				//are we inside a subj polygon ...
				var Inside = true;
				var e2 = e.PrevInAEL;
				while (e2 !== null)
				{
					if (e2.PolyTyp === e.PolyTyp && e2.WindDelta !== 0)
						Inside = !Inside;
					e2 = e2.PrevInAEL;
				}
				edge.WindCnt = (Inside ? 0 : 1);
			}
			else
			{
				edge.WindCnt = edge.WindDelta;
			}
			edge.WindCnt2 = e.WindCnt2;
			e = e.NextInAEL;
			//ie get ready to calc WindCnt2
		}
		else
		{
			//nonZero, Positive or Negative filling ...
			if (e.WindCnt * e.WindDelta < 0)
			{
				//prev edge is 'decreasing' WindCount (WC) toward zero
				//so we're outside the previous polygon ...
				if (Math.abs(e.WindCnt) > 1)
				{
					//outside prev poly but still inside another.
					//when reversing direction of prev poly use the same WC
					if (e.WindDelta * edge.WindDelta < 0)
						edge.WindCnt = e.WindCnt;
					else
						edge.WindCnt = e.WindCnt + edge.WindDelta;
				}
				else
					edge.WindCnt = (edge.WindDelta === 0 ? 1 : edge.WindDelta);
			}
			else
			{
				//prev edge is 'increasing' WindCount (WC) away from zero
				//so we're inside the previous polygon ...
				if (edge.WindDelta === 0)
					edge.WindCnt = (e.WindCnt < 0 ? e.WindCnt - 1 : e.WindCnt + 1);
				else if (e.WindDelta * edge.WindDelta < 0)
					edge.WindCnt = e.WindCnt;
				else
					edge.WindCnt = e.WindCnt + edge.WindDelta;
			}
			edge.WindCnt2 = e.WindCnt2;
			e = e.NextInAEL;
			//ie get ready to calc WindCnt2
		}
		//update WindCnt2 ...
		if (this.IsEvenOddAltFillType(edge))
		{
			//EvenOdd filling ...
			while (e !== edge)
			{
				if (e.WindDelta !== 0)
					edge.WindCnt2 = (edge.WindCnt2 === 0 ? 1 : 0);
				e = e.NextInAEL;
			}
		}
		else
		{
			//nonZero, Positive or Negative filling ...
			while (e !== edge)
			{
				edge.WindCnt2 += e.WindDelta;
				e = e.NextInAEL;
			}
		}
	};

	ClipperLib.Clipper.prototype.AddEdgeToSEL = function (edge)
	{
		//SEL pointers in PEdge are use to build transient lists of horizontal edges.
		//However, since we don't need to worry about processing order, all additions
		//are made to the front of the list ...
		if (this.m_SortedEdges === null)
		{
			this.m_SortedEdges = edge;
			edge.PrevInSEL = null;
			edge.NextInSEL = null;
		}
		else
		{
			edge.NextInSEL = this.m_SortedEdges;
			edge.PrevInSEL = null;
			this.m_SortedEdges.PrevInSEL = edge;
			this.m_SortedEdges = edge;
		}
	};

	ClipperLib.Clipper.prototype.PopEdgeFromSEL = function (e)
	{
		//Pop edge from front of SEL (ie SEL is a FILO list)
		e.v = this.m_SortedEdges;
		if (e.v === null)
		{
			return false;
		}
		var oldE = e.v;
		this.m_SortedEdges = e.v.NextInSEL;
		if (this.m_SortedEdges !== null)
		{
			this.m_SortedEdges.PrevInSEL = null;
		}
		oldE.NextInSEL = null;
		oldE.PrevInSEL = null;
		return true;
	};

	ClipperLib.Clipper.prototype.CopyAELToSEL = function ()
	{
		var e = this.m_ActiveEdges;
		this.m_SortedEdges = e;
		while (e !== null)
		{
			e.PrevInSEL = e.PrevInAEL;
			e.NextInSEL = e.NextInAEL;
			e = e.NextInAEL;
		}
	};

	ClipperLib.Clipper.prototype.SwapPositionsInSEL = function (edge1, edge2)
	{
		if (edge1.NextInSEL === null && edge1.PrevInSEL === null)
			return;
		if (edge2.NextInSEL === null && edge2.PrevInSEL === null)
			return;
		if (edge1.NextInSEL === edge2)
		{
			var next = edge2.NextInSEL;
			if (next !== null)
				next.PrevInSEL = edge1;
			var prev = edge1.PrevInSEL;
			if (prev !== null)
				prev.NextInSEL = edge2;
			edge2.PrevInSEL = prev;
			edge2.NextInSEL = edge1;
			edge1.PrevInSEL = edge2;
			edge1.NextInSEL = next;
		}
		else if (edge2.NextInSEL === edge1)
		{
			var next = edge1.NextInSEL;
			if (next !== null)
				next.PrevInSEL = edge2;
			var prev = edge2.PrevInSEL;
			if (prev !== null)
				prev.NextInSEL = edge1;
			edge1.PrevInSEL = prev;
			edge1.NextInSEL = edge2;
			edge2.PrevInSEL = edge1;
			edge2.NextInSEL = next;
		}
		else
		{
			var next = edge1.NextInSEL;
			var prev = edge1.PrevInSEL;
			edge1.NextInSEL = edge2.NextInSEL;
			if (edge1.NextInSEL !== null)
				edge1.NextInSEL.PrevInSEL = edge1;
			edge1.PrevInSEL = edge2.PrevInSEL;
			if (edge1.PrevInSEL !== null)
				edge1.PrevInSEL.NextInSEL = edge1;
			edge2.NextInSEL = next;
			if (edge2.NextInSEL !== null)
				edge2.NextInSEL.PrevInSEL = edge2;
			edge2.PrevInSEL = prev;
			if (edge2.PrevInSEL !== null)
				edge2.PrevInSEL.NextInSEL = edge2;
		}
		if (edge1.PrevInSEL === null)
			this.m_SortedEdges = edge1;
		else if (edge2.PrevInSEL === null)
			this.m_SortedEdges = edge2;
	};

	ClipperLib.Clipper.prototype.AddLocalMaxPoly = function (e1, e2, pt)
	{
		this.AddOutPt(e1, pt);
		if (e2.WindDelta === 0) this.AddOutPt(e2, pt);
		if (e1.OutIdx === e2.OutIdx)
		{
			e1.OutIdx = -1;
			e2.OutIdx = -1;
		}
		else if (e1.OutIdx < e2.OutIdx)
			this.AppendPolygon(e1, e2);
		else
			this.AppendPolygon(e2, e1);
	};

	ClipperLib.Clipper.prototype.AddLocalMinPoly = function (e1, e2, pt)
	{
		var result;
		var e, prevE;
		if (ClipperLib.ClipperBase.IsHorizontal(e2) || (e1.Dx > e2.Dx))
		{
			result = this.AddOutPt(e1, pt);
			e2.OutIdx = e1.OutIdx;
			e1.Side = ClipperLib.EdgeSide.esLeft;
			e2.Side = ClipperLib.EdgeSide.esRight;
			e = e1;
			if (e.PrevInAEL === e2)
				prevE = e2.PrevInAEL;
			else
				prevE = e.PrevInAEL;
		}
		else
		{
			result = this.AddOutPt(e2, pt);
			e1.OutIdx = e2.OutIdx;
			e1.Side = ClipperLib.EdgeSide.esRight;
			e2.Side = ClipperLib.EdgeSide.esLeft;
			e = e2;
			if (e.PrevInAEL === e1)
				prevE = e1.PrevInAEL;
			else
				prevE = e.PrevInAEL;
		}

		if (prevE !== null && prevE.OutIdx >= 0 && prevE.Top.Y < pt.Y && e.Top.Y < pt.Y)
		{
			var xPrev = ClipperLib.Clipper.TopX(prevE, pt.Y);
			var xE = ClipperLib.Clipper.TopX(e, pt.Y);
			if ((xPrev === xE) && (e.WindDelta !== 0) && (prevE.WindDelta !== 0) && ClipperLib.ClipperBase.SlopesEqual5(new ClipperLib.IntPoint2(xPrev, pt.Y), prevE.Top, new ClipperLib.IntPoint2(xE, pt.Y), e.Top, this.m_UseFullRange))
			{
				var outPt = this.AddOutPt(prevE, pt);
				this.AddJoin(result, outPt, e.Top);
			}
		}
		return result;
	};

	ClipperLib.Clipper.prototype.AddOutPt = function (e, pt)
	{
		if (e.OutIdx < 0)
		{
			var outRec = this.CreateOutRec();
			outRec.IsOpen = (e.WindDelta === 0);
			var newOp = new ClipperLib.OutPt();
			outRec.Pts = newOp;
			newOp.Idx = outRec.Idx;
			//newOp.Pt = pt;
			newOp.Pt.X = pt.X;
			newOp.Pt.Y = pt.Y;
			if (ClipperLib.use_xyz) newOp.Pt.Z = pt.Z;
			newOp.Next = newOp;
			newOp.Prev = newOp;
			if (!outRec.IsOpen)
				this.SetHoleState(e, outRec);
			e.OutIdx = outRec.Idx;
			//nb: do this after SetZ !
			return newOp;
		}
		else
		{
			var outRec = this.m_PolyOuts[e.OutIdx];
			//OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
			var op = outRec.Pts;
			var ToFront = (e.Side === ClipperLib.EdgeSide.esLeft);
			if (ToFront && ClipperLib.IntPoint.op_Equality(pt, op.Pt))
				return op;
			else if (!ToFront && ClipperLib.IntPoint.op_Equality(pt, op.Prev.Pt))
				return op.Prev;
			var newOp = new ClipperLib.OutPt();
			newOp.Idx = outRec.Idx;
			//newOp.Pt = pt;
			newOp.Pt.X = pt.X;
			newOp.Pt.Y = pt.Y;
			if (ClipperLib.use_xyz) newOp.Pt.Z = pt.Z;
			newOp.Next = op;
			newOp.Prev = op.Prev;
			newOp.Prev.Next = newOp;
			op.Prev = newOp;
			if (ToFront)
				outRec.Pts = newOp;
			return newOp;
		}
	};

	ClipperLib.Clipper.prototype.GetLastOutPt = function (e)
	{
		var outRec = this.m_PolyOuts[e.OutIdx];
		if (e.Side === ClipperLib.EdgeSide.esLeft)
		{
			return outRec.Pts;
		}
		else
		{
			return outRec.Pts.Prev;
		}
	};

	ClipperLib.Clipper.prototype.SwapPoints = function (pt1, pt2)
	{
		var tmp = new ClipperLib.IntPoint1(pt1.Value);
		//pt1.Value = pt2.Value;
		pt1.Value.X = pt2.Value.X;
		pt1.Value.Y = pt2.Value.Y;
		if (ClipperLib.use_xyz) pt1.Value.Z = pt2.Value.Z;
		//pt2.Value = tmp;
		pt2.Value.X = tmp.X;
		pt2.Value.Y = tmp.Y;
		if (ClipperLib.use_xyz) pt2.Value.Z = tmp.Z;
	};

	ClipperLib.Clipper.prototype.HorzSegmentsOverlap = function (seg1a, seg1b, seg2a, seg2b)
	{
		var tmp;
		if (seg1a > seg1b)
		{
			tmp = seg1a;
			seg1a = seg1b;
			seg1b = tmp;
		}
		if (seg2a > seg2b)
		{
			tmp = seg2a;
			seg2a = seg2b;
			seg2b = tmp;
		}
		return (seg1a < seg2b) && (seg2a < seg1b);
	}

	ClipperLib.Clipper.prototype.SetHoleState = function (e, outRec)
	{
		var e2 = e.PrevInAEL;
		var eTmp = null;
		while (e2 !== null)
		{
			if (e2.OutIdx >= 0 && e2.WindDelta !== 0)
			{
				if (eTmp === null)
					eTmp = e2;
				else if (eTmp.OutIdx === e2.OutIdx)
					eTmp = null; //paired
			}
			e2 = e2.PrevInAEL;
		}

		if (eTmp === null)
		{
			outRec.FirstLeft = null;
			outRec.IsHole = false;
		}
		else
		{
			outRec.FirstLeft = this.m_PolyOuts[eTmp.OutIdx];
			outRec.IsHole = !outRec.FirstLeft.IsHole;
		}
	};

	ClipperLib.Clipper.prototype.GetDx = function (pt1, pt2)
	{
		if (pt1.Y === pt2.Y)
			return ClipperLib.ClipperBase.horizontal;
		else
			return (pt2.X - pt1.X) / (pt2.Y - pt1.Y);
	};

	ClipperLib.Clipper.prototype.FirstIsBottomPt = function (btmPt1, btmPt2)
	{
		var p = btmPt1.Prev;
		while ((ClipperLib.IntPoint.op_Equality(p.Pt, btmPt1.Pt)) && (p !== btmPt1))
			p = p.Prev;
		var dx1p = Math.abs(this.GetDx(btmPt1.Pt, p.Pt));
		p = btmPt1.Next;
		while ((ClipperLib.IntPoint.op_Equality(p.Pt, btmPt1.Pt)) && (p !== btmPt1))
			p = p.Next;
		var dx1n = Math.abs(this.GetDx(btmPt1.Pt, p.Pt));
		p = btmPt2.Prev;
		while ((ClipperLib.IntPoint.op_Equality(p.Pt, btmPt2.Pt)) && (p !== btmPt2))
			p = p.Prev;
		var dx2p = Math.abs(this.GetDx(btmPt2.Pt, p.Pt));
		p = btmPt2.Next;
		while ((ClipperLib.IntPoint.op_Equality(p.Pt, btmPt2.Pt)) && (p !== btmPt2))
			p = p.Next;
		var dx2n = Math.abs(this.GetDx(btmPt2.Pt, p.Pt));

		if (Math.max(dx1p, dx1n) === Math.max(dx2p, dx2n) && Math.min(dx1p, dx1n) === Math.min(dx2p, dx2n))
		{
			return this.Area(btmPt1) > 0; //if otherwise identical use orientation
		}
		else
		{
			return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
		}
	};

	ClipperLib.Clipper.prototype.GetBottomPt = function (pp)
	{
		var dups = null;
		var p = pp.Next;
		while (p !== pp)
		{
			if (p.Pt.Y > pp.Pt.Y)
			{
				pp = p;
				dups = null;
			}
			else if (p.Pt.Y === pp.Pt.Y && p.Pt.X <= pp.Pt.X)
			{
				if (p.Pt.X < pp.Pt.X)
				{
					dups = null;
					pp = p;
				}
				else
				{
					if (p.Next !== pp && p.Prev !== pp)
						dups = p;
				}
			}
			p = p.Next;
		}
		if (dups !== null)
		{
			//there appears to be at least 2 vertices at bottomPt so ...
			while (dups !== p)
			{
				if (!this.FirstIsBottomPt(p, dups))
					pp = dups;
				dups = dups.Next;
				while (ClipperLib.IntPoint.op_Inequality(dups.Pt, pp.Pt))
					dups = dups.Next;
			}
		}
		return pp;
	};

	ClipperLib.Clipper.prototype.GetLowermostRec = function (outRec1, outRec2)
	{
		//work out which polygon fragment has the correct hole state ...
		if (outRec1.BottomPt === null)
			outRec1.BottomPt = this.GetBottomPt(outRec1.Pts);
		if (outRec2.BottomPt === null)
			outRec2.BottomPt = this.GetBottomPt(outRec2.Pts);
		var bPt1 = outRec1.BottomPt;
		var bPt2 = outRec2.BottomPt;
		if (bPt1.Pt.Y > bPt2.Pt.Y)
			return outRec1;
		else if (bPt1.Pt.Y < bPt2.Pt.Y)
			return outRec2;
		else if (bPt1.Pt.X < bPt2.Pt.X)
			return outRec1;
		else if (bPt1.Pt.X > bPt2.Pt.X)
			return outRec2;
		else if (bPt1.Next === bPt1)
			return outRec2;
		else if (bPt2.Next === bPt2)
			return outRec1;
		else if (this.FirstIsBottomPt(bPt1, bPt2))
			return outRec1;
		else
			return outRec2;
	};

	ClipperLib.Clipper.prototype.OutRec1RightOfOutRec2 = function (outRec1, outRec2)
	{
		do {
			outRec1 = outRec1.FirstLeft;
			if (outRec1 === outRec2)
				return true;
		}
		while (outRec1 !== null)
		return false;
	};

	ClipperLib.Clipper.prototype.GetOutRec = function (idx)
	{
		var outrec = this.m_PolyOuts[idx];
		while (outrec !== this.m_PolyOuts[outrec.Idx])
			outrec = this.m_PolyOuts[outrec.Idx];
		return outrec;
	};

	ClipperLib.Clipper.prototype.AppendPolygon = function (e1, e2)
	{
		//get the start and ends of both output polygons ...
		var outRec1 = this.m_PolyOuts[e1.OutIdx];
		var outRec2 = this.m_PolyOuts[e2.OutIdx];
		var holeStateRec;
		if (this.OutRec1RightOfOutRec2(outRec1, outRec2))
			holeStateRec = outRec2;
		else if (this.OutRec1RightOfOutRec2(outRec2, outRec1))
			holeStateRec = outRec1;
		else
			holeStateRec = this.GetLowermostRec(outRec1, outRec2);

		//get the start and ends of both output polygons and
		//join E2 poly onto E1 poly and delete pointers to E2 ...

		var p1_lft = outRec1.Pts;
		var p1_rt = p1_lft.Prev;
		var p2_lft = outRec2.Pts;
		var p2_rt = p2_lft.Prev;
		//join e2 poly onto e1 poly and delete pointers to e2 ...
		if (e1.Side === ClipperLib.EdgeSide.esLeft)
		{
			if (e2.Side === ClipperLib.EdgeSide.esLeft)
			{
				//z y x a b c
				this.ReversePolyPtLinks(p2_lft);
				p2_lft.Next = p1_lft;
				p1_lft.Prev = p2_lft;
				p1_rt.Next = p2_rt;
				p2_rt.Prev = p1_rt;
				outRec1.Pts = p2_rt;
			}
			else
			{
				//x y z a b c
				p2_rt.Next = p1_lft;
				p1_lft.Prev = p2_rt;
				p2_lft.Prev = p1_rt;
				p1_rt.Next = p2_lft;
				outRec1.Pts = p2_lft;
			}
		}
		else
		{
			if (e2.Side === ClipperLib.EdgeSide.esRight)
			{
				//a b c z y x
				this.ReversePolyPtLinks(p2_lft);
				p1_rt.Next = p2_rt;
				p2_rt.Prev = p1_rt;
				p2_lft.Next = p1_lft;
				p1_lft.Prev = p2_lft;
			}
			else
			{
				//a b c x y z
				p1_rt.Next = p2_lft;
				p2_lft.Prev = p1_rt;
				p1_lft.Prev = p2_rt;
				p2_rt.Next = p1_lft;
			}
		}
		outRec1.BottomPt = null;
		if (holeStateRec === outRec2)
		{
			if (outRec2.FirstLeft !== outRec1)
				outRec1.FirstLeft = outRec2.FirstLeft;
			outRec1.IsHole = outRec2.IsHole;
		}
		outRec2.Pts = null;
		outRec2.BottomPt = null;
		outRec2.FirstLeft = outRec1;
		var OKIdx = e1.OutIdx;
		var ObsoleteIdx = e2.OutIdx;
		e1.OutIdx = -1;
		//nb: safe because we only get here via AddLocalMaxPoly
		e2.OutIdx = -1;
		var e = this.m_ActiveEdges;
		while (e !== null)
		{
			if (e.OutIdx === ObsoleteIdx)
			{
				e.OutIdx = OKIdx;
				e.Side = e1.Side;
				break;
			}
			e = e.NextInAEL;
		}
		outRec2.Idx = outRec1.Idx;
	};

	ClipperLib.Clipper.prototype.ReversePolyPtLinks = function (pp)
	{
		if (pp === null)
			return;
		var pp1;
		var pp2;
		pp1 = pp;
		do {
			pp2 = pp1.Next;
			pp1.Next = pp1.Prev;
			pp1.Prev = pp2;
			pp1 = pp2;
		}
		while (pp1 !== pp)
	};

	ClipperLib.Clipper.SwapSides = function (edge1, edge2)
	{
		var side = edge1.Side;
		edge1.Side = edge2.Side;
		edge2.Side = side;
	};

	ClipperLib.Clipper.SwapPolyIndexes = function (edge1, edge2)
	{
		var outIdx = edge1.OutIdx;
		edge1.OutIdx = edge2.OutIdx;
		edge2.OutIdx = outIdx;
	};

	ClipperLib.Clipper.prototype.IntersectEdges = function (e1, e2, pt)
	{
		//e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
		//e2 in AEL except when e1 is being inserted at the intersection point ...
		var e1Contributing = (e1.OutIdx >= 0);
		var e2Contributing = (e2.OutIdx >= 0);

		if (ClipperLib.use_xyz)
			this.SetZ(pt, e1, e2);

		if (ClipperLib.use_lines)
		{
			//if either edge is on an OPEN path ...
			if (e1.WindDelta === 0 || e2.WindDelta === 0)
			{
				//ignore subject-subject open path intersections UNLESS they
				//are both open paths, AND they are both 'contributing maximas' ...
				if (e1.WindDelta === 0 && e2.WindDelta === 0) return;
				//if intersecting a subj line with a subj poly ...
				else if (e1.PolyTyp === e2.PolyTyp &&
					e1.WindDelta !== e2.WindDelta && this.m_ClipType === ClipperLib.ClipType.ctUnion)
				{
					if (e1.WindDelta === 0)
					{
						if (e2Contributing)
						{
							this.AddOutPt(e1, pt);
							if (e1Contributing)
								e1.OutIdx = -1;
						}
					}
					else
					{
						if (e1Contributing)
						{
							this.AddOutPt(e2, pt);
							if (e2Contributing)
								e2.OutIdx = -1;
						}
					}
				}
				else if (e1.PolyTyp !== e2.PolyTyp)
				{
					if ((e1.WindDelta === 0) && Math.abs(e2.WindCnt) === 1 &&
						(this.m_ClipType !== ClipperLib.ClipType.ctUnion || e2.WindCnt2 === 0))
					{
						this.AddOutPt(e1, pt);
						if (e1Contributing)
							e1.OutIdx = -1;
					}
					else if ((e2.WindDelta === 0) && (Math.abs(e1.WindCnt) === 1) &&
						(this.m_ClipType !== ClipperLib.ClipType.ctUnion || e1.WindCnt2 === 0))
					{
						this.AddOutPt(e2, pt);
						if (e2Contributing)
							e2.OutIdx = -1;
					}
				}
				return;
			}
		}
		//update winding counts...
		//assumes that e1 will be to the Right of e2 ABOVE the intersection
		if (e1.PolyTyp === e2.PolyTyp)
		{
			if (this.IsEvenOddFillType(e1))
			{
				var oldE1WindCnt = e1.WindCnt;
				e1.WindCnt = e2.WindCnt;
				e2.WindCnt = oldE1WindCnt;
			}
			else
			{
				if (e1.WindCnt + e2.WindDelta === 0)
					e1.WindCnt = -e1.WindCnt;
				else
					e1.WindCnt += e2.WindDelta;
				if (e2.WindCnt - e1.WindDelta === 0)
					e2.WindCnt = -e2.WindCnt;
				else
					e2.WindCnt -= e1.WindDelta;
			}
		}
		else
		{
			if (!this.IsEvenOddFillType(e2))
				e1.WindCnt2 += e2.WindDelta;
			else
				e1.WindCnt2 = (e1.WindCnt2 === 0) ? 1 : 0;
			if (!this.IsEvenOddFillType(e1))
				e2.WindCnt2 -= e1.WindDelta;
			else
				e2.WindCnt2 = (e2.WindCnt2 === 0) ? 1 : 0;
		}
		var e1FillType, e2FillType, e1FillType2, e2FillType2;
		if (e1.PolyTyp === ClipperLib.PolyType.ptSubject)
		{
			e1FillType = this.m_SubjFillType;
			e1FillType2 = this.m_ClipFillType;
		}
		else
		{
			e1FillType = this.m_ClipFillType;
			e1FillType2 = this.m_SubjFillType;
		}
		if (e2.PolyTyp === ClipperLib.PolyType.ptSubject)
		{
			e2FillType = this.m_SubjFillType;
			e2FillType2 = this.m_ClipFillType;
		}
		else
		{
			e2FillType = this.m_ClipFillType;
			e2FillType2 = this.m_SubjFillType;
		}
		var e1Wc, e2Wc;
		switch (e1FillType)
		{
		case ClipperLib.PolyFillType.pftPositive:
			e1Wc = e1.WindCnt;
			break;
		case ClipperLib.PolyFillType.pftNegative:
			e1Wc = -e1.WindCnt;
			break;
		default:
			e1Wc = Math.abs(e1.WindCnt);
			break;
		}
		switch (e2FillType)
		{
		case ClipperLib.PolyFillType.pftPositive:
			e2Wc = e2.WindCnt;
			break;
		case ClipperLib.PolyFillType.pftNegative:
			e2Wc = -e2.WindCnt;
			break;
		default:
			e2Wc = Math.abs(e2.WindCnt);
			break;
		}
		if (e1Contributing && e2Contributing)
		{
			if ((e1Wc !== 0 && e1Wc !== 1) || (e2Wc !== 0 && e2Wc !== 1) ||
				(e1.PolyTyp !== e2.PolyTyp && this.m_ClipType !== ClipperLib.ClipType.ctXor))
			{
				this.AddLocalMaxPoly(e1, e2, pt);
			}
			else
			{
				this.AddOutPt(e1, pt);
				this.AddOutPt(e2, pt);
				ClipperLib.Clipper.SwapSides(e1, e2);
				ClipperLib.Clipper.SwapPolyIndexes(e1, e2);
			}
		}
		else if (e1Contributing)
		{
			if (e2Wc === 0 || e2Wc === 1)
			{
				this.AddOutPt(e1, pt);
				ClipperLib.Clipper.SwapSides(e1, e2);
				ClipperLib.Clipper.SwapPolyIndexes(e1, e2);
			}
		}
		else if (e2Contributing)
		{
			if (e1Wc === 0 || e1Wc === 1)
			{
				this.AddOutPt(e2, pt);
				ClipperLib.Clipper.SwapSides(e1, e2);
				ClipperLib.Clipper.SwapPolyIndexes(e1, e2);
			}
		}
		else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1))
		{
			//neither edge is currently contributing ...
			var e1Wc2, e2Wc2;
			switch (e1FillType2)
			{
			case ClipperLib.PolyFillType.pftPositive:
				e1Wc2 = e1.WindCnt2;
				break;
			case ClipperLib.PolyFillType.pftNegative:
				e1Wc2 = -e1.WindCnt2;
				break;
			default:
				e1Wc2 = Math.abs(e1.WindCnt2);
				break;
			}
			switch (e2FillType2)
			{
			case ClipperLib.PolyFillType.pftPositive:
				e2Wc2 = e2.WindCnt2;
				break;
			case ClipperLib.PolyFillType.pftNegative:
				e2Wc2 = -e2.WindCnt2;
				break;
			default:
				e2Wc2 = Math.abs(e2.WindCnt2);
				break;
			}
			if (e1.PolyTyp !== e2.PolyTyp)
			{
				this.AddLocalMinPoly(e1, e2, pt);
			}
			else if (e1Wc === 1 && e2Wc === 1)
				switch (this.m_ClipType)
				{
				case ClipperLib.ClipType.ctIntersection:
					if (e1Wc2 > 0 && e2Wc2 > 0)
						this.AddLocalMinPoly(e1, e2, pt);
					break;
				case ClipperLib.ClipType.ctUnion:
					if (e1Wc2 <= 0 && e2Wc2 <= 0)
						this.AddLocalMinPoly(e1, e2, pt);
					break;
				case ClipperLib.ClipType.ctDifference:
					if (((e1.PolyTyp === ClipperLib.PolyType.ptClip) && (e1Wc2 > 0) && (e2Wc2 > 0)) ||
						((e1.PolyTyp === ClipperLib.PolyType.ptSubject) && (e1Wc2 <= 0) && (e2Wc2 <= 0)))
						this.AddLocalMinPoly(e1, e2, pt);
					break;
				case ClipperLib.ClipType.ctXor:
					this.AddLocalMinPoly(e1, e2, pt);
					break;
				}
			else
				ClipperLib.Clipper.SwapSides(e1, e2);
		}
	};

	ClipperLib.Clipper.prototype.DeleteFromSEL = function (e)
	{
		var SelPrev = e.PrevInSEL;
		var SelNext = e.NextInSEL;
		if (SelPrev === null && SelNext === null && (e !== this.m_SortedEdges))
			return;
		//already deleted
		if (SelPrev !== null)
			SelPrev.NextInSEL = SelNext;
		else
			this.m_SortedEdges = SelNext;
		if (SelNext !== null)
			SelNext.PrevInSEL = SelPrev;
		e.NextInSEL = null;
		e.PrevInSEL = null;
	};

	ClipperLib.Clipper.prototype.ProcessHorizontals = function ()
	{
		var horzEdge = {}; //m_SortedEdges;
		while (this.PopEdgeFromSEL(horzEdge))
		{
			this.ProcessHorizontal(horzEdge.v);
		}
	};

	ClipperLib.Clipper.prototype.GetHorzDirection = function (HorzEdge, $var)
	{
		if (HorzEdge.Bot.X < HorzEdge.Top.X)
		{
			$var.Left = HorzEdge.Bot.X;
			$var.Right = HorzEdge.Top.X;
			$var.Dir = ClipperLib.Direction.dLeftToRight;
		}
		else
		{
			$var.Left = HorzEdge.Top.X;
			$var.Right = HorzEdge.Bot.X;
			$var.Dir = ClipperLib.Direction.dRightToLeft;
		}
	};

	ClipperLib.Clipper.prototype.ProcessHorizontal = function (horzEdge)
	{
		var $var = {
			Dir: null,
			Left: null,
			Right: null
		};

		this.GetHorzDirection(horzEdge, $var);
		var dir = $var.Dir;
		var horzLeft = $var.Left;
		var horzRight = $var.Right;

		var IsOpen = horzEdge.WindDelta === 0;

		var eLastHorz = horzEdge,
			eMaxPair = null;
		while (eLastHorz.NextInLML !== null && ClipperLib.ClipperBase.IsHorizontal(eLastHorz.NextInLML))
			eLastHorz = eLastHorz.NextInLML;
		if (eLastHorz.NextInLML === null)
			eMaxPair = this.GetMaximaPair(eLastHorz);

		var currMax = this.m_Maxima;
		if (currMax !== null)
		{
			//get the first maxima in range (X) ...
			if (dir === ClipperLib.Direction.dLeftToRight)
			{
				while (currMax !== null && currMax.X <= horzEdge.Bot.X)
				{
					currMax = currMax.Next;
				}
				if (currMax !== null && currMax.X >= eLastHorz.Top.X)
				{
					currMax = null;
				}
			}
			else
			{
				while (currMax.Next !== null && currMax.Next.X < horzEdge.Bot.X)
				{
					currMax = currMax.Next;
				}
				if (currMax.X <= eLastHorz.Top.X)
				{
					currMax = null;
				}
			}
		}
		var op1 = null;
		for (;;) //loop through consec. horizontal edges
		{
			var IsLastHorz = (horzEdge === eLastHorz);
			var e = this.GetNextInAEL(horzEdge, dir);
			while (e !== null)
			{
				//this code block inserts extra coords into horizontal edges (in output
				//polygons) whereever maxima touch these horizontal edges. This helps
				//'simplifying' polygons (ie if the Simplify property is set).
				if (currMax !== null)
				{
					if (dir === ClipperLib.Direction.dLeftToRight)
					{
						while (currMax !== null && currMax.X < e.Curr.X)
						{
							if (horzEdge.OutIdx >= 0 && !IsOpen)
							{
								this.AddOutPt(horzEdge, new ClipperLib.IntPoint2(currMax.X, horzEdge.Bot.Y));
							}
							currMax = currMax.Next;
						}
					}
					else
					{
						while (currMax !== null && currMax.X > e.Curr.X)
						{
							if (horzEdge.OutIdx >= 0 && !IsOpen)
							{
								this.AddOutPt(horzEdge, new ClipperLib.IntPoint2(currMax.X, horzEdge.Bot.Y));
							}
							currMax = currMax.Prev;
						}
					}
				}

				if ((dir === ClipperLib.Direction.dLeftToRight && e.Curr.X > horzRight) || (dir === ClipperLib.Direction.dRightToLeft && e.Curr.X < horzLeft))
				{
					break;
				}

				//Also break if we've got to the end of an intermediate horizontal edge ...
				//nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
				if (e.Curr.X === horzEdge.Top.X && horzEdge.NextInLML !== null && e.Dx < horzEdge.NextInLML.Dx)
					break;

				if (horzEdge.OutIdx >= 0 && !IsOpen) //note: may be done multiple times
				{
					if (ClipperLib.use_xyz)
					{
						if (dir === ClipperLib.Direction.dLeftToRight)
							this.SetZ(e.Curr, horzEdge, e);
						else this.SetZ(e.Curr, e, horzEdge);
					}

					op1 = this.AddOutPt(horzEdge, e.Curr);
					var eNextHorz = this.m_SortedEdges;
					while (eNextHorz !== null)
					{
						if (eNextHorz.OutIdx >= 0 && this.HorzSegmentsOverlap(horzEdge.Bot.X, horzEdge.Top.X, eNextHorz.Bot.X, eNextHorz.Top.X))
						{
							var op2 = this.GetLastOutPt(eNextHorz);
							this.AddJoin(op2, op1, eNextHorz.Top);
						}
						eNextHorz = eNextHorz.NextInSEL;
					}
					this.AddGhostJoin(op1, horzEdge.Bot);
				}

				//OK, so far we're still in range of the horizontal Edge  but make sure
				//we're at the last of consec. horizontals when matching with eMaxPair
				if (e === eMaxPair && IsLastHorz)
				{
					if (horzEdge.OutIdx >= 0)
					{
						this.AddLocalMaxPoly(horzEdge, eMaxPair, horzEdge.Top);
					}
					this.DeleteFromAEL(horzEdge);
					this.DeleteFromAEL(eMaxPair);
					return;
				}

				if (dir === ClipperLib.Direction.dLeftToRight)
				{
					var Pt = new ClipperLib.IntPoint2(e.Curr.X, horzEdge.Curr.Y);
					this.IntersectEdges(horzEdge, e, Pt);
				}
				else
				{
					var Pt = new ClipperLib.IntPoint2(e.Curr.X, horzEdge.Curr.Y);
					this.IntersectEdges(e, horzEdge, Pt);
				}
				var eNext = this.GetNextInAEL(e, dir);
				this.SwapPositionsInAEL(horzEdge, e);
				e = eNext;
			} //end while(e !== null)

			//Break out of loop if HorzEdge.NextInLML is not also horizontal ...
			if (horzEdge.NextInLML === null || !ClipperLib.ClipperBase.IsHorizontal(horzEdge.NextInLML))
			{
				break;
			}

			horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
			if (horzEdge.OutIdx >= 0)
			{
				this.AddOutPt(horzEdge, horzEdge.Bot);
			}

			$var = {
				Dir: dir,
				Left: horzLeft,
				Right: horzRight
			};

			this.GetHorzDirection(horzEdge, $var);
			dir = $var.Dir;
			horzLeft = $var.Left;
			horzRight = $var.Right;

		} //end for (;;)

		if (horzEdge.OutIdx >= 0 && op1 === null)
		{
			op1 = this.GetLastOutPt(horzEdge);
			var eNextHorz = this.m_SortedEdges;
			while (eNextHorz !== null)
			{
				if (eNextHorz.OutIdx >= 0 && this.HorzSegmentsOverlap(horzEdge.Bot.X, horzEdge.Top.X, eNextHorz.Bot.X, eNextHorz.Top.X))
				{
					var op2 = this.GetLastOutPt(eNextHorz);
					this.AddJoin(op2, op1, eNextHorz.Top);
				}
				eNextHorz = eNextHorz.NextInSEL;
			}
			this.AddGhostJoin(op1, horzEdge.Top);
		}

		if (horzEdge.NextInLML !== null)
		{
			if (horzEdge.OutIdx >= 0)
			{
				op1 = this.AddOutPt(horzEdge, horzEdge.Top);

				horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
				if (horzEdge.WindDelta === 0)
				{
					return;
				}
				//nb: HorzEdge is no longer horizontal here
				var ePrev = horzEdge.PrevInAEL;
				var eNext = horzEdge.NextInAEL;
				if (ePrev !== null && ePrev.Curr.X === horzEdge.Bot.X && ePrev.Curr.Y === horzEdge.Bot.Y && ePrev.WindDelta === 0 && (ePrev.OutIdx >= 0 && ePrev.Curr.Y > ePrev.Top.Y && ClipperLib.ClipperBase.SlopesEqual3(horzEdge, ePrev, this.m_UseFullRange)))
				{
					var op2 = this.AddOutPt(ePrev, horzEdge.Bot);
					this.AddJoin(op1, op2, horzEdge.Top);
				}
				else if (eNext !== null && eNext.Curr.X === horzEdge.Bot.X && eNext.Curr.Y === horzEdge.Bot.Y && eNext.WindDelta !== 0 && eNext.OutIdx >= 0 && eNext.Curr.Y > eNext.Top.Y && ClipperLib.ClipperBase.SlopesEqual3(horzEdge, eNext, this.m_UseFullRange))
				{
					var op2 = this.AddOutPt(eNext, horzEdge.Bot);
					this.AddJoin(op1, op2, horzEdge.Top);
				}
			}
			else
			{
				horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
			}
		}
		else
		{
			if (horzEdge.OutIdx >= 0)
			{
				this.AddOutPt(horzEdge, horzEdge.Top);
			}
			this.DeleteFromAEL(horzEdge);
		}
	};

	ClipperLib.Clipper.prototype.GetNextInAEL = function (e, Direction)
	{
		return Direction === ClipperLib.Direction.dLeftToRight ? e.NextInAEL : e.PrevInAEL;
	};

	ClipperLib.Clipper.prototype.IsMinima = function (e)
	{
		return e !== null && (e.Prev.NextInLML !== e) && (e.Next.NextInLML !== e);
	};

	ClipperLib.Clipper.prototype.IsMaxima = function (e, Y)
	{
		return (e !== null && e.Top.Y === Y && e.NextInLML === null);
	};

	ClipperLib.Clipper.prototype.IsIntermediate = function (e, Y)
	{
		return (e.Top.Y === Y && e.NextInLML !== null);
	};

	ClipperLib.Clipper.prototype.GetMaximaPair = function (e)
	{
		if ((ClipperLib.IntPoint.op_Equality(e.Next.Top, e.Top)) && e.Next.NextInLML === null)
		{
			return e.Next;
		}
		else
		{
			if ((ClipperLib.IntPoint.op_Equality(e.Prev.Top, e.Top)) && e.Prev.NextInLML === null)
			{
				return e.Prev;
			}
			else
			{
				return null;
			}
		}
	};

	ClipperLib.Clipper.prototype.GetMaximaPairEx = function (e)
	{
		//as above but returns null if MaxPair isn't in AEL (unless it's horizontal)
		var result = this.GetMaximaPair(e);
		if (result === null || result.OutIdx === ClipperLib.ClipperBase.Skip ||
			((result.NextInAEL === result.PrevInAEL) && !ClipperLib.ClipperBase.IsHorizontal(result)))
		{
			return null;
		}
		return result;
	};

	ClipperLib.Clipper.prototype.ProcessIntersections = function (topY)
	{
		if (this.m_ActiveEdges === null)
			return true;
		try
		{
			this.BuildIntersectList(topY);
			if (this.m_IntersectList.length === 0)
				return true;
			if (this.m_IntersectList.length === 1 || this.FixupIntersectionOrder())
				this.ProcessIntersectList();
			else
				return false;
		}
		catch ($$e2)
		{
			this.m_SortedEdges = null;
			this.m_IntersectList.length = 0;
			ClipperLib.Error("ProcessIntersections error");
		}
		this.m_SortedEdges = null;
		return true;
	};

	ClipperLib.Clipper.prototype.BuildIntersectList = function (topY)
	{
		if (this.m_ActiveEdges === null)
			return;
		//prepare for sorting ...
		var e = this.m_ActiveEdges;
		//console.log(JSON.stringify(JSON.decycle( e )));
		this.m_SortedEdges = e;
		while (e !== null)
		{
			e.PrevInSEL = e.PrevInAEL;
			e.NextInSEL = e.NextInAEL;
			e.Curr.X = ClipperLib.Clipper.TopX(e, topY);
			e = e.NextInAEL;
		}
		//bubblesort ...
		var isModified = true;
		while (isModified && this.m_SortedEdges !== null)
		{
			isModified = false;
			e = this.m_SortedEdges;
			while (e.NextInSEL !== null)
			{
				var eNext = e.NextInSEL;
				var pt = new ClipperLib.IntPoint0();
				//console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
				if (e.Curr.X > eNext.Curr.X)
				{
					this.IntersectPoint(e, eNext, pt);
					if (pt.Y < topY)
					{
						pt = new ClipperLib.IntPoint2(ClipperLib.Clipper.TopX(e, topY), topY);
					}
					var newNode = new ClipperLib.IntersectNode();
					newNode.Edge1 = e;
					newNode.Edge2 = eNext;
					//newNode.Pt = pt;
					newNode.Pt.X = pt.X;
					newNode.Pt.Y = pt.Y;
					if (ClipperLib.use_xyz) newNode.Pt.Z = pt.Z;
					this.m_IntersectList.push(newNode);
					this.SwapPositionsInSEL(e, eNext);
					isModified = true;
				}
				else
					e = eNext;
			}
			if (e.PrevInSEL !== null)
				e.PrevInSEL.NextInSEL = null;
			else
				break;
		}
		this.m_SortedEdges = null;
	};

	ClipperLib.Clipper.prototype.EdgesAdjacent = function (inode)
	{
		return (inode.Edge1.NextInSEL === inode.Edge2) || (inode.Edge1.PrevInSEL === inode.Edge2);
	};

	ClipperLib.Clipper.IntersectNodeSort = function (node1, node2)
	{
		//the following typecast is safe because the differences in Pt.Y will
		//be limited to the height of the scanbeam.
		return (node2.Pt.Y - node1.Pt.Y);
	};

	ClipperLib.Clipper.prototype.FixupIntersectionOrder = function ()
	{
		//pre-condition: intersections are sorted bottom-most first.
		//Now it's crucial that intersections are made only between adjacent edges,
		//so to ensure this the order of intersections may need adjusting ...
		this.m_IntersectList.sort(this.m_IntersectNodeComparer);
		this.CopyAELToSEL();
		var cnt = this.m_IntersectList.length;
		for (var i = 0; i < cnt; i++)
		{
			if (!this.EdgesAdjacent(this.m_IntersectList[i]))
			{
				var j = i + 1;
				while (j < cnt && !this.EdgesAdjacent(this.m_IntersectList[j]))
					j++;
				if (j === cnt)
					return false;
				var tmp = this.m_IntersectList[i];
				this.m_IntersectList[i] = this.m_IntersectList[j];
				this.m_IntersectList[j] = tmp;
			}
			this.SwapPositionsInSEL(this.m_IntersectList[i].Edge1, this.m_IntersectList[i].Edge2);
		}
		return true;
	};

	ClipperLib.Clipper.prototype.ProcessIntersectList = function ()
	{
		for (var i = 0, ilen = this.m_IntersectList.length; i < ilen; i++)
		{
			var iNode = this.m_IntersectList[i];
			this.IntersectEdges(iNode.Edge1, iNode.Edge2, iNode.Pt);
			this.SwapPositionsInAEL(iNode.Edge1, iNode.Edge2);
		}
		this.m_IntersectList.length = 0;
	};

	/*
	--------------------------------
	Round speedtest: http://jsperf.com/fastest-round
	--------------------------------
	*/
	var R1 = function (a)
	{
		return a < 0 ? Math.ceil(a - 0.5) : Math.round(a)
	};

	var R2 = function (a)
	{
		return a < 0 ? Math.ceil(a - 0.5) : Math.floor(a + 0.5)
	};

	var R3 = function (a)
	{
		return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a)
	};

	var R4 = function (a)
	{
		if (a < 0)
		{
			a -= 0.5;
			return a < -2147483648 ? Math.ceil(a) : a | 0;
		}
		else
		{
			a += 0.5;
			return a > 2147483647 ? Math.floor(a) : a | 0;
		}
	};

	if (browser.msie) ClipperLib.Clipper.Round = R1;
	else if (browser.chromium) ClipperLib.Clipper.Round = R3;
	else if (browser.safari) ClipperLib.Clipper.Round = R4;
	else ClipperLib.Clipper.Round = R2; // eg. browser.chrome || browser.firefox || browser.opera
	ClipperLib.Clipper.TopX = function (edge, currentY)
	{
		//if (edge.Bot == edge.Curr) alert ("edge.Bot = edge.Curr");
		//if (edge.Bot == edge.Top) alert ("edge.Bot = edge.Top");
		if (currentY === edge.Top.Y)
			return edge.Top.X;
		return edge.Bot.X + ClipperLib.Clipper.Round(edge.Dx * (currentY - edge.Bot.Y));
	};

	ClipperLib.Clipper.prototype.IntersectPoint = function (edge1, edge2, ip)
	{
		ip.X = 0;
		ip.Y = 0;
		var b1, b2;
		//nb: with very large coordinate values, it's possible for SlopesEqual() to
		//return false but for the edge.Dx value be equal due to double precision rounding.
		if (edge1.Dx === edge2.Dx)
		{
			ip.Y = edge1.Curr.Y;
			ip.X = ClipperLib.Clipper.TopX(edge1, ip.Y);
			return;
		}
		if (edge1.Delta.X === 0)
		{
			ip.X = edge1.Bot.X;
			if (ClipperLib.ClipperBase.IsHorizontal(edge2))
			{
				ip.Y = edge2.Bot.Y;
			}
			else
			{
				b2 = edge2.Bot.Y - (edge2.Bot.X / edge2.Dx);
				ip.Y = ClipperLib.Clipper.Round(ip.X / edge2.Dx + b2);
			}
		}
		else if (edge2.Delta.X === 0)
		{
			ip.X = edge2.Bot.X;
			if (ClipperLib.ClipperBase.IsHorizontal(edge1))
			{
				ip.Y = edge1.Bot.Y;
			}
			else
			{
				b1 = edge1.Bot.Y - (edge1.Bot.X / edge1.Dx);
				ip.Y = ClipperLib.Clipper.Round(ip.X / edge1.Dx + b1);
			}
		}
		else
		{
			b1 = edge1.Bot.X - edge1.Bot.Y * edge1.Dx;
			b2 = edge2.Bot.X - edge2.Bot.Y * edge2.Dx;
			var q = (b2 - b1) / (edge1.Dx - edge2.Dx);
			ip.Y = ClipperLib.Clipper.Round(q);
			if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx))
				ip.X = ClipperLib.Clipper.Round(edge1.Dx * q + b1);
			else
				ip.X = ClipperLib.Clipper.Round(edge2.Dx * q + b2);
		}
		if (ip.Y < edge1.Top.Y || ip.Y < edge2.Top.Y)
		{
			if (edge1.Top.Y > edge2.Top.Y)
			{
				ip.Y = edge1.Top.Y;
				ip.X = ClipperLib.Clipper.TopX(edge2, edge1.Top.Y);
				return ip.X < edge1.Top.X;
			}
			else
				ip.Y = edge2.Top.Y;
			if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx))
				ip.X = ClipperLib.Clipper.TopX(edge1, ip.Y);
			else
				ip.X = ClipperLib.Clipper.TopX(edge2, ip.Y);
		}
		//finally, don't allow 'ip' to be BELOW curr.Y (ie bottom of scanbeam) ...
		if (ip.Y > edge1.Curr.Y)
		{
			ip.Y = edge1.Curr.Y;
			//better to use the more vertical edge to derive X ...
			if (Math.abs(edge1.Dx) > Math.abs(edge2.Dx))
				ip.X = ClipperLib.Clipper.TopX(edge2, ip.Y);
			else
				ip.X = ClipperLib.Clipper.TopX(edge1, ip.Y);
		}
	};

	ClipperLib.Clipper.prototype.ProcessEdgesAtTopOfScanbeam = function (topY)
	{
		var e = this.m_ActiveEdges;

		while (e !== null)
		{
			//1. process maxima, treating them as if they're 'bent' horizontal edges,
			//   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
			var IsMaximaEdge = this.IsMaxima(e, topY);
			if (IsMaximaEdge)
			{
				var eMaxPair = this.GetMaximaPairEx(e);
				IsMaximaEdge = (eMaxPair === null || !ClipperLib.ClipperBase.IsHorizontal(eMaxPair));
			}
			if (IsMaximaEdge)
			{
				if (this.StrictlySimple)
				{
					this.InsertMaxima(e.Top.X);
				}
				var ePrev = e.PrevInAEL;
				this.DoMaxima(e);
				if (ePrev === null)
					e = this.m_ActiveEdges;
				else
					e = ePrev.NextInAEL;
			}
			else
			{
				//2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
				if (this.IsIntermediate(e, topY) && ClipperLib.ClipperBase.IsHorizontal(e.NextInLML))
				{
					e = this.UpdateEdgeIntoAEL(e);
					if (e.OutIdx >= 0)
						this.AddOutPt(e, e.Bot);
					this.AddEdgeToSEL(e);
				}
				else
				{
					e.Curr.X = ClipperLib.Clipper.TopX(e, topY);
					e.Curr.Y = topY;
				}

				if (ClipperLib.use_xyz)
				{
					if (e.Top.Y === topY) e.Curr.Z = e.Top.Z;
					else if (e.Bot.Y === topY) e.Curr.Z = e.Bot.Z;
					else e.Curr.Z = 0;
				}

				//When StrictlySimple and 'e' is being touched by another edge, then
				//make sure both edges have a vertex here ...
				if (this.StrictlySimple)
				{
					var ePrev = e.PrevInAEL;
					if ((e.OutIdx >= 0) && (e.WindDelta !== 0) && ePrev !== null &&
						(ePrev.OutIdx >= 0) && (ePrev.Curr.X === e.Curr.X) &&
						(ePrev.WindDelta !== 0))
					{
						var ip = new ClipperLib.IntPoint1(e.Curr);

						if (ClipperLib.use_xyz)
						{
							this.SetZ(ip, ePrev, e);
						}

						var op = this.AddOutPt(ePrev, ip);
						var op2 = this.AddOutPt(e, ip);
						this.AddJoin(op, op2, ip); //StrictlySimple (type-3) join
					}
				}
				e = e.NextInAEL;
			}
		}
		//3. Process horizontals at the Top of the scanbeam ...
		this.ProcessHorizontals();
		this.m_Maxima = null;
		//4. Promote intermediate vertices ...
		e = this.m_ActiveEdges;
		while (e !== null)
		{
			if (this.IsIntermediate(e, topY))
			{
				var op = null;
				if (e.OutIdx >= 0)
					op = this.AddOutPt(e, e.Top);
				e = this.UpdateEdgeIntoAEL(e);
				//if output polygons share an edge, they'll need joining later ...
				var ePrev = e.PrevInAEL;
				var eNext = e.NextInAEL;

				if (ePrev !== null && ePrev.Curr.X === e.Bot.X && ePrev.Curr.Y === e.Bot.Y && op !== null && ePrev.OutIdx >= 0 && ePrev.Curr.Y === ePrev.Top.Y && ClipperLib.ClipperBase.SlopesEqual5(e.Curr, e.Top, ePrev.Curr, ePrev.Top, this.m_UseFullRange) && (e.WindDelta !== 0) && (ePrev.WindDelta !== 0))
				{
					var op2 = this.AddOutPt(ePrev2, e.Bot);
					this.AddJoin(op, op2, e.Top);
				}
				else if (eNext !== null && eNext.Curr.X === e.Bot.X && eNext.Curr.Y === e.Bot.Y && op !== null && eNext.OutIdx >= 0 && eNext.Curr.Y === eNext.Top.Y && ClipperLib.ClipperBase.SlopesEqual5(e.Curr, e.Top, eNext.Curr, eNext.Top, this.m_UseFullRange) && (e.WindDelta !== 0) && (eNext.WindDelta !== 0))
				{
					var op2 = this.AddOutPt(eNext, e.Bot);
					this.AddJoin(op, op2, e.Top);
				}
			}
			e = e.NextInAEL;
		}
	};

	ClipperLib.Clipper.prototype.DoMaxima = function (e)
	{
		var eMaxPair = this.GetMaximaPairEx(e);
		if (eMaxPair === null)
		{
			if (e.OutIdx >= 0)
				this.AddOutPt(e, e.Top);
			this.DeleteFromAEL(e);
			return;
		}
		var eNext = e.NextInAEL;
		while (eNext !== null && eNext !== eMaxPair)
		{
			this.IntersectEdges(e, eNext, e.Top);
			this.SwapPositionsInAEL(e, eNext);
			eNext = e.NextInAEL;
		}
		if (e.OutIdx === -1 && eMaxPair.OutIdx === -1)
		{
			this.DeleteFromAEL(e);
			this.DeleteFromAEL(eMaxPair);
		}
		else if (e.OutIdx >= 0 && eMaxPair.OutIdx >= 0)
		{
			if (e.OutIdx >= 0) this.AddLocalMaxPoly(e, eMaxPair, e.Top);
			this.DeleteFromAEL(e);
			this.DeleteFromAEL(eMaxPair);
		}
		else if (ClipperLib.use_lines && e.WindDelta === 0)
		{
			if (e.OutIdx >= 0)
			{
				this.AddOutPt(e, e.Top);
				e.OutIdx = ClipperLib.ClipperBase.Unassigned;
			}
			this.DeleteFromAEL(e);
			if (eMaxPair.OutIdx >= 0)
			{
				this.AddOutPt(eMaxPair, e.Top);
				eMaxPair.OutIdx = ClipperLib.ClipperBase.Unassigned;
			}
			this.DeleteFromAEL(eMaxPair);
		}
		else
			ClipperLib.Error("DoMaxima error");
	};

	ClipperLib.Clipper.ReversePaths = function (polys)
	{
		for (var i = 0, len = polys.length; i < len; i++)
			polys[i].reverse();
	};

	ClipperLib.Clipper.Orientation = function (poly)
	{
		return ClipperLib.Clipper.Area(poly) >= 0;
	};

	ClipperLib.Clipper.prototype.PointCount = function (pts)
	{
		if (pts === null)
			return 0;
		var result = 0;
		var p = pts;
		do {
			result++;
			p = p.Next;
		}
		while (p !== pts)
		return result;
	};

	ClipperLib.Clipper.prototype.BuildResult = function (polyg)
	{
		ClipperLib.Clear(polyg);
		for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
		{
			var outRec = this.m_PolyOuts[i];
			if (outRec.Pts === null)
				continue;
			var p = outRec.Pts.Prev;
			var cnt = this.PointCount(p);
			if (cnt < 2)
				continue;
			var pg = new Array(cnt);
			for (var j = 0; j < cnt; j++)
			{
				pg[j] = p.Pt;
				p = p.Prev;
			}
			polyg.push(pg);
		}
	};

	ClipperLib.Clipper.prototype.BuildResult2 = function (polytree)
	{
		polytree.Clear();
		//add each output polygon/contour to polytree ...
		//polytree.m_AllPolys.set_Capacity(this.m_PolyOuts.length);
		for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
		{
			var outRec = this.m_PolyOuts[i];
			var cnt = this.PointCount(outRec.Pts);
			if ((outRec.IsOpen && cnt < 2) || (!outRec.IsOpen && cnt < 3))
				continue;
			this.FixHoleLinkage(outRec);
			var pn = new ClipperLib.PolyNode();
			polytree.m_AllPolys.push(pn);
			outRec.PolyNode = pn;
			pn.m_polygon.length = cnt;
			var op = outRec.Pts.Prev;
			for (var j = 0; j < cnt; j++)
			{
				pn.m_polygon[j] = op.Pt;
				op = op.Prev;
			}
		}
		//fixup PolyNode links etc ...
		//polytree.m_Childs.set_Capacity(this.m_PolyOuts.length);
		for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
		{
			var outRec = this.m_PolyOuts[i];
			if (outRec.PolyNode === null)
				continue;
			else if (outRec.IsOpen)
			{
				outRec.PolyNode.IsOpen = true;
				polytree.AddChild(outRec.PolyNode);
			}
			else if (outRec.FirstLeft !== null && outRec.FirstLeft.PolyNode !== null)
				outRec.FirstLeft.PolyNode.AddChild(outRec.PolyNode);
			else
				polytree.AddChild(outRec.PolyNode);
		}
	};

	ClipperLib.Clipper.prototype.FixupOutPolyline = function (outRec)
	{
		var pp = outRec.Pts;
		var lastPP = pp.Prev;
		while (pp !== lastPP)
		{
			pp = pp.Next;
			if (ClipperLib.IntPoint.op_Equality(pp.Pt, pp.Prev.Pt))
			{
				if (pp === lastPP)
				{
					lastPP = pp.Prev;
				}
				var tmpPP = pp.Prev;
				tmpPP.Next = pp.Next;
				pp.Next.Prev = tmpPP;
				pp = tmpPP;
			}
		}
		if (pp === pp.Prev)
		{
			outRec.Pts = null;
		}
	};

	ClipperLib.Clipper.prototype.FixupOutPolygon = function (outRec)
	{
		//FixupOutPolygon() - removes duplicate points and simplifies consecutive
		//parallel edges by removing the middle vertex.
		var lastOK = null;
		outRec.BottomPt = null;
		var pp = outRec.Pts;
		var preserveCol = this.PreserveCollinear || this.StrictlySimple;
		for (;;)
		{
			if (pp.Prev === pp || pp.Prev === pp.Next)
			{
				outRec.Pts = null;
				return;
			}

			//test for duplicate points and collinear edges ...
			if ((ClipperLib.IntPoint.op_Equality(pp.Pt, pp.Next.Pt)) || (ClipperLib.IntPoint.op_Equality(pp.Pt, pp.Prev.Pt)) || (ClipperLib.ClipperBase.SlopesEqual4(pp.Prev.Pt, pp.Pt, pp.Next.Pt, this.m_UseFullRange) && (!preserveCol || !this.Pt2IsBetweenPt1AndPt3(pp.Prev.Pt, pp.Pt, pp.Next.Pt))))
			{
				lastOK = null;
				pp.Prev.Next = pp.Next;
				pp.Next.Prev = pp.Prev;
				pp = pp.Prev;
			}
			else if (pp === lastOK)
				break;
			else
			{
				if (lastOK === null)
					lastOK = pp;
				pp = pp.Next;
			}
		}
		outRec.Pts = pp;
	};

	ClipperLib.Clipper.prototype.DupOutPt = function (outPt, InsertAfter)
	{
		var result = new ClipperLib.OutPt();
		//result.Pt = outPt.Pt;
		result.Pt.X = outPt.Pt.X;
		result.Pt.Y = outPt.Pt.Y;
		if (ClipperLib.use_xyz) result.Pt.Z = outPt.Pt.Z;
		result.Idx = outPt.Idx;
		if (InsertAfter)
		{
			result.Next = outPt.Next;
			result.Prev = outPt;
			outPt.Next.Prev = result;
			outPt.Next = result;
		}
		else
		{
			result.Prev = outPt.Prev;
			result.Next = outPt;
			outPt.Prev.Next = result;
			outPt.Prev = result;
		}
		return result;
	};

	ClipperLib.Clipper.prototype.GetOverlap = function (a1, a2, b1, b2, $val)
	{
		if (a1 < a2)
		{
			if (b1 < b2)
			{
				$val.Left = Math.max(a1, b1);
				$val.Right = Math.min(a2, b2);
			}
			else
			{
				$val.Left = Math.max(a1, b2);
				$val.Right = Math.min(a2, b1);
			}
		}
		else
		{
			if (b1 < b2)
			{
				$val.Left = Math.max(a2, b1);
				$val.Right = Math.min(a1, b2);
			}
			else
			{
				$val.Left = Math.max(a2, b2);
				$val.Right = Math.min(a1, b1);
			}
		}
		return $val.Left < $val.Right;
	};

	ClipperLib.Clipper.prototype.JoinHorz = function (op1, op1b, op2, op2b, Pt, DiscardLeft)
	{
		var Dir1 = (op1.Pt.X > op1b.Pt.X ? ClipperLib.Direction.dRightToLeft : ClipperLib.Direction.dLeftToRight);
		var Dir2 = (op2.Pt.X > op2b.Pt.X ? ClipperLib.Direction.dRightToLeft : ClipperLib.Direction.dLeftToRight);
		if (Dir1 === Dir2)
			return false;
		//When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
		//want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
		//So, to facilitate this while inserting Op1b and Op2b ...
		//when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
		//otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
		if (Dir1 === ClipperLib.Direction.dLeftToRight)
		{
			while (op1.Next.Pt.X <= Pt.X &&
				op1.Next.Pt.X >= op1.Pt.X && op1.Next.Pt.Y === Pt.Y)
				op1 = op1.Next;
			if (DiscardLeft && (op1.Pt.X !== Pt.X))
				op1 = op1.Next;
			op1b = this.DupOutPt(op1, !DiscardLeft);
			if (ClipperLib.IntPoint.op_Inequality(op1b.Pt, Pt))
			{
				op1 = op1b;
				//op1.Pt = Pt;
				op1.Pt.X = Pt.X;
				op1.Pt.Y = Pt.Y;
				if (ClipperLib.use_xyz) op1.Pt.Z = Pt.Z;
				op1b = this.DupOutPt(op1, !DiscardLeft);
			}
		}
		else
		{
			while (op1.Next.Pt.X >= Pt.X &&
				op1.Next.Pt.X <= op1.Pt.X && op1.Next.Pt.Y === Pt.Y)
				op1 = op1.Next;
			if (!DiscardLeft && (op1.Pt.X !== Pt.X))
				op1 = op1.Next;
			op1b = this.DupOutPt(op1, DiscardLeft);
			if (ClipperLib.IntPoint.op_Inequality(op1b.Pt, Pt))
			{
				op1 = op1b;
				//op1.Pt = Pt;
				op1.Pt.X = Pt.X;
				op1.Pt.Y = Pt.Y;
				if (ClipperLib.use_xyz) op1.Pt.Z = Pt.Z;
				op1b = this.DupOutPt(op1, DiscardLeft);
			}
		}
		if (Dir2 === ClipperLib.Direction.dLeftToRight)
		{
			while (op2.Next.Pt.X <= Pt.X &&
				op2.Next.Pt.X >= op2.Pt.X && op2.Next.Pt.Y === Pt.Y)
				op2 = op2.Next;
			if (DiscardLeft && (op2.Pt.X !== Pt.X))
				op2 = op2.Next;
			op2b = this.DupOutPt(op2, !DiscardLeft);
			if (ClipperLib.IntPoint.op_Inequality(op2b.Pt, Pt))
			{
				op2 = op2b;
				//op2.Pt = Pt;
				op2.Pt.X = Pt.X;
				op2.Pt.Y = Pt.Y;
				if (ClipperLib.use_xyz) op2.Pt.Z = Pt.Z;
				op2b = this.DupOutPt(op2, !DiscardLeft);
			}
		}
		else
		{
			while (op2.Next.Pt.X >= Pt.X &&
				op2.Next.Pt.X <= op2.Pt.X && op2.Next.Pt.Y === Pt.Y)
				op2 = op2.Next;
			if (!DiscardLeft && (op2.Pt.X !== Pt.X))
				op2 = op2.Next;
			op2b = this.DupOutPt(op2, DiscardLeft);
			if (ClipperLib.IntPoint.op_Inequality(op2b.Pt, Pt))
			{
				op2 = op2b;
				//op2.Pt = Pt;
				op2.Pt.X = Pt.X;
				op2.Pt.Y = Pt.Y;
				if (ClipperLib.use_xyz) op2.Pt.Z = Pt.Z;
				op2b = this.DupOutPt(op2, DiscardLeft);
			}
		}
		if ((Dir1 === ClipperLib.Direction.dLeftToRight) === DiscardLeft)
		{
			op1.Prev = op2;
			op2.Next = op1;
			op1b.Next = op2b;
			op2b.Prev = op1b;
		}
		else
		{
			op1.Next = op2;
			op2.Prev = op1;
			op1b.Prev = op2b;
			op2b.Next = op1b;
		}
		return true;
	};

	ClipperLib.Clipper.prototype.JoinPoints = function (j, outRec1, outRec2)
	{
		var op1 = j.OutPt1,
			op1b = new ClipperLib.OutPt();
		var op2 = j.OutPt2,
			op2b = new ClipperLib.OutPt();
		//There are 3 kinds of joins for output polygons ...
		//1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are vertices anywhere
		//along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
		//2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
		//location at the Bottom of the overlapping segment (& Join.OffPt is above).
		//3. StrictlySimple joins where edges touch but are not collinear and where
		//Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
		var isHorizontal = (j.OutPt1.Pt.Y === j.OffPt.Y);
		if (isHorizontal && (ClipperLib.IntPoint.op_Equality(j.OffPt, j.OutPt1.Pt)) && (ClipperLib.IntPoint.op_Equality(j.OffPt, j.OutPt2.Pt)))
		{
			//Strictly Simple join ...
			if (outRec1 !== outRec2) return false;

			op1b = j.OutPt1.Next;
			while (op1b !== op1 && (ClipperLib.IntPoint.op_Equality(op1b.Pt, j.OffPt)))
				op1b = op1b.Next;
			var reverse1 = (op1b.Pt.Y > j.OffPt.Y);
			op2b = j.OutPt2.Next;
			while (op2b !== op2 && (ClipperLib.IntPoint.op_Equality(op2b.Pt, j.OffPt)))
				op2b = op2b.Next;
			var reverse2 = (op2b.Pt.Y > j.OffPt.Y);
			if (reverse1 === reverse2)
				return false;
			if (reverse1)
			{
				op1b = this.DupOutPt(op1, false);
				op2b = this.DupOutPt(op2, true);
				op1.Prev = op2;
				op2.Next = op1;
				op1b.Next = op2b;
				op2b.Prev = op1b;
				j.OutPt1 = op1;
				j.OutPt2 = op1b;
				return true;
			}
			else
			{
				op1b = this.DupOutPt(op1, true);
				op2b = this.DupOutPt(op2, false);
				op1.Next = op2;
				op2.Prev = op1;
				op1b.Prev = op2b;
				op2b.Next = op1b;
				j.OutPt1 = op1;
				j.OutPt2 = op1b;
				return true;
			}
		}
		else if (isHorizontal)
		{
			//treat horizontal joins differently to non-horizontal joins since with
			//them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
			//may be anywhere along the horizontal edge.
			op1b = op1;
			while (op1.Prev.Pt.Y === op1.Pt.Y && op1.Prev !== op1b && op1.Prev !== op2)
				op1 = op1.Prev;
			while (op1b.Next.Pt.Y === op1b.Pt.Y && op1b.Next !== op1 && op1b.Next !== op2)
				op1b = op1b.Next;
			if (op1b.Next === op1 || op1b.Next === op2)
				return false;
			//a flat 'polygon'
			op2b = op2;
			while (op2.Prev.Pt.Y === op2.Pt.Y && op2.Prev !== op2b && op2.Prev !== op1b)
				op2 = op2.Prev;
			while (op2b.Next.Pt.Y === op2b.Pt.Y && op2b.Next !== op2 && op2b.Next !== op1)
				op2b = op2b.Next;
			if (op2b.Next === op2 || op2b.Next === op1)
				return false;
			//a flat 'polygon'
			//Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

			var $val = {
				Left: null,
				Right: null
			};

			if (!this.GetOverlap(op1.Pt.X, op1b.Pt.X, op2.Pt.X, op2b.Pt.X, $val))
				return false;
			var Left = $val.Left;
			var Right = $val.Right;

			//DiscardLeftSide: when overlapping edges are joined, a spike will created
			//which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
			//on the discard Side as either may still be needed for other joins ...
			var Pt = new ClipperLib.IntPoint0();
			var DiscardLeftSide;
			if (op1.Pt.X >= Left && op1.Pt.X <= Right)
			{
				//Pt = op1.Pt;
				Pt.X = op1.Pt.X;
				Pt.Y = op1.Pt.Y;
				if (ClipperLib.use_xyz) Pt.Z = op1.Pt.Z;
				DiscardLeftSide = (op1.Pt.X > op1b.Pt.X);
			}
			else if (op2.Pt.X >= Left && op2.Pt.X <= Right)
			{
				//Pt = op2.Pt;
				Pt.X = op2.Pt.X;
				Pt.Y = op2.Pt.Y;
				if (ClipperLib.use_xyz) Pt.Z = op2.Pt.Z;
				DiscardLeftSide = (op2.Pt.X > op2b.Pt.X);
			}
			else if (op1b.Pt.X >= Left && op1b.Pt.X <= Right)
			{
				//Pt = op1b.Pt;
				Pt.X = op1b.Pt.X;
				Pt.Y = op1b.Pt.Y;
				if (ClipperLib.use_xyz) Pt.Z = op1b.Pt.Z;
				DiscardLeftSide = op1b.Pt.X > op1.Pt.X;
			}
			else
			{
				//Pt = op2b.Pt;
				Pt.X = op2b.Pt.X;
				Pt.Y = op2b.Pt.Y;
				if (ClipperLib.use_xyz) Pt.Z = op2b.Pt.Z;
				DiscardLeftSide = (op2b.Pt.X > op2.Pt.X);
			}
			j.OutPt1 = op1;
			j.OutPt2 = op2;
			return this.JoinHorz(op1, op1b, op2, op2b, Pt, DiscardLeftSide);
		}
		else
		{
			//nb: For non-horizontal joins ...
			//    1. Jr.OutPt1.Pt.Y == Jr.OutPt2.Pt.Y
			//    2. Jr.OutPt1.Pt > Jr.OffPt.Y
			//make sure the polygons are correctly oriented ...
			op1b = op1.Next;
			while ((ClipperLib.IntPoint.op_Equality(op1b.Pt, op1.Pt)) && (op1b !== op1))
				op1b = op1b.Next;
			var Reverse1 = ((op1b.Pt.Y > op1.Pt.Y) || !ClipperLib.ClipperBase.SlopesEqual4(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange));
			if (Reverse1)
			{
				op1b = op1.Prev;
				while ((ClipperLib.IntPoint.op_Equality(op1b.Pt, op1.Pt)) && (op1b !== op1))
					op1b = op1b.Prev;

				if ((op1b.Pt.Y > op1.Pt.Y) || !ClipperLib.ClipperBase.SlopesEqual4(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange))
					return false;
			}
			op2b = op2.Next;
			while ((ClipperLib.IntPoint.op_Equality(op2b.Pt, op2.Pt)) && (op2b !== op2))
				op2b = op2b.Next;

			var Reverse2 = ((op2b.Pt.Y > op2.Pt.Y) || !ClipperLib.ClipperBase.SlopesEqual4(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange));
			if (Reverse2)
			{
				op2b = op2.Prev;
				while ((ClipperLib.IntPoint.op_Equality(op2b.Pt, op2.Pt)) && (op2b !== op2))
					op2b = op2b.Prev;

				if ((op2b.Pt.Y > op2.Pt.Y) || !ClipperLib.ClipperBase.SlopesEqual4(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange))
					return false;
			}
			if ((op1b === op1) || (op2b === op2) || (op1b === op2b) ||
				((outRec1 === outRec2) && (Reverse1 === Reverse2)))
				return false;
			if (Reverse1)
			{
				op1b = this.DupOutPt(op1, false);
				op2b = this.DupOutPt(op2, true);
				op1.Prev = op2;
				op2.Next = op1;
				op1b.Next = op2b;
				op2b.Prev = op1b;
				j.OutPt1 = op1;
				j.OutPt2 = op1b;
				return true;
			}
			else
			{
				op1b = this.DupOutPt(op1, true);
				op2b = this.DupOutPt(op2, false);
				op1.Next = op2;
				op2.Prev = op1;
				op1b.Prev = op2b;
				op2b.Next = op1b;
				j.OutPt1 = op1;
				j.OutPt2 = op1b;
				return true;
			}
		}
	};

	ClipperLib.Clipper.GetBounds = function (paths)
	{
		var i = 0,
			cnt = paths.length;
		while (i < cnt && paths[i].length === 0) i++;
		if (i === cnt) return new ClipperLib.IntRect(0, 0, 0, 0);
		var result = new ClipperLib.IntRect();
		result.left = paths[i][0].X;
		result.right = result.left;
		result.top = paths[i][0].Y;
		result.bottom = result.top;
		for (; i < cnt; i++)
			for (var j = 0, jlen = paths[i].length; j < jlen; j++)
			{
				if (paths[i][j].X < result.left) result.left = paths[i][j].X;
				else if (paths[i][j].X > result.right) result.right = paths[i][j].X;
				if (paths[i][j].Y < result.top) result.top = paths[i][j].Y;
				else if (paths[i][j].Y > result.bottom) result.bottom = paths[i][j].Y;
			}
		return result;
	}
	ClipperLib.Clipper.prototype.GetBounds2 = function (ops)
	{
		var opStart = ops;
		var result = new ClipperLib.IntRect();
		result.left = ops.Pt.X;
		result.right = ops.Pt.X;
		result.top = ops.Pt.Y;
		result.bottom = ops.Pt.Y;
		ops = ops.Next;
		while (ops !== opStart)
		{
			if (ops.Pt.X < result.left)
				result.left = ops.Pt.X;
			if (ops.Pt.X > result.right)
				result.right = ops.Pt.X;
			if (ops.Pt.Y < result.top)
				result.top = ops.Pt.Y;
			if (ops.Pt.Y > result.bottom)
				result.bottom = ops.Pt.Y;
			ops = ops.Next;
		}
		return result;
	};

	ClipperLib.Clipper.PointInPolygon = function (pt, path)
	{
		//returns 0 if false, +1 if true, -1 if pt ON polygon boundary
		//See "The Point in Polygon Problem for Arbitrary Polygons" by Hormann & Agathos
		//http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
		var result = 0,
			cnt = path.length;
		if (cnt < 3)
			return 0;
		var ip = path[0];
		for (var i = 1; i <= cnt; ++i)
		{
			var ipNext = (i === cnt ? path[0] : path[i]);
			if (ipNext.Y === pt.Y)
			{
				if ((ipNext.X === pt.X) || (ip.Y === pt.Y && ((ipNext.X > pt.X) === (ip.X < pt.X))))
					return -1;
			}
			if ((ip.Y < pt.Y) !== (ipNext.Y < pt.Y))
			{
				if (ip.X >= pt.X)
				{
					if (ipNext.X > pt.X)
						result = 1 - result;
					else
					{
						var d = (ip.X - pt.X) * (ipNext.Y - pt.Y) - (ipNext.X - pt.X) * (ip.Y - pt.Y);
						if (d === 0)
							return -1;
						else if ((d > 0) === (ipNext.Y > ip.Y))
							result = 1 - result;
					}
				}
				else
				{
					if (ipNext.X > pt.X)
					{
						var d = (ip.X - pt.X) * (ipNext.Y - pt.Y) - (ipNext.X - pt.X) * (ip.Y - pt.Y);
						if (d === 0)
							return -1;
						else if ((d > 0) === (ipNext.Y > ip.Y))
							result = 1 - result;
					}
				}
			}
			ip = ipNext;
		}
		return result;
	};

	ClipperLib.Clipper.prototype.PointInPolygon = function (pt, op)
	{
		//returns 0 if false, +1 if true, -1 if pt ON polygon boundary
		var result = 0;
		var startOp = op;
		var ptx = pt.X,
			pty = pt.Y;
		var poly0x = op.Pt.X,
			poly0y = op.Pt.Y;
		do {
			op = op.Next;
			var poly1x = op.Pt.X,
				poly1y = op.Pt.Y;
			if (poly1y === pty)
			{
				if ((poly1x === ptx) || (poly0y === pty && ((poly1x > ptx) === (poly0x < ptx))))
					return -1;
			}
			if ((poly0y < pty) !== (poly1y < pty))
			{
				if (poly0x >= ptx)
				{
					if (poly1x > ptx)
						result = 1 - result;
					else
					{
						var d = (poly0x - ptx) * (poly1y - pty) - (poly1x - ptx) * (poly0y - pty);
						if (d === 0)
							return -1;
						if ((d > 0) === (poly1y > poly0y))
							result = 1 - result;
					}
				}
				else
				{
					if (poly1x > ptx)
					{
						var d = (poly0x - ptx) * (poly1y - pty) - (poly1x - ptx) * (poly0y - pty);
						if (d === 0)
							return -1;
						if ((d > 0) === (poly1y > poly0y))
							result = 1 - result;
					}
				}
			}
			poly0x = poly1x;
			poly0y = poly1y;
		} while (startOp !== op);

		return result;
	};

	ClipperLib.Clipper.prototype.Poly2ContainsPoly1 = function (outPt1, outPt2)
	{
		var op = outPt1;
		do {
			//nb: PointInPolygon returns 0 if false, +1 if true, -1 if pt on polygon
			var res = this.PointInPolygon(op.Pt, outPt2);
			if (res >= 0)
				return res > 0;
			op = op.Next;
		}
		while (op !== outPt1)
		return true;
	};

	ClipperLib.Clipper.prototype.FixupFirstLefts1 = function (OldOutRec, NewOutRec)
	{
		var outRec, firstLeft;
		for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
		{
			outRec = this.m_PolyOuts[i];
			firstLeft = ClipperLib.Clipper.ParseFirstLeft(outRec.FirstLeft);
			if (outRec.Pts !== null && firstLeft === OldOutRec)
			{
				if (this.Poly2ContainsPoly1(outRec.Pts, NewOutRec.Pts))
					outRec.FirstLeft = NewOutRec;
			}
		}
	}

	ClipperLib.Clipper.prototype.FixupFirstLefts2 = function (innerOutRec, outerOutRec)
	{
		//A polygon has split into two such that one is now the inner of the other.
		//It's possible that these polygons now wrap around other polygons, so check
		//every polygon that's also contained by OuterOutRec's FirstLeft container
		//(including nil) to see if they've become inner to the new inner polygon ...
		var orfl = outerOutRec.FirstLeft;
		var outRec, firstLeft;
		for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
		{
			outRec = this.m_PolyOuts[i];
			if (outRec.Pts === null || outRec === outerOutRec || outRec === innerOutRec)
				continue;
			firstLeft = ClipperLib.Clipper.ParseFirstLeft(outRec.FirstLeft);
			if (firstLeft !== orfl && firstLeft !== innerOutRec && firstLeft !== outerOutRec)
				continue;
			if (this.Poly2ContainsPoly1(outRec.Pts, innerOutRec.Pts))
				outRec.FirstLeft = innerOutRec;
			else if (this.Poly2ContainsPoly1(outRec.Pts, outerOutRec.Pts))
				outRec.FirstLeft = outerOutRec;
			else if (outRec.FirstLeft === innerOutRec || outRec.FirstLeft === outerOutRec)
				outRec.FirstLeft = orfl;
		}
	}

	ClipperLib.Clipper.prototype.FixupFirstLefts3 = function (OldOutRec, NewOutRec)
	{
		//same as FixupFirstLefts1 but doesn't call Poly2ContainsPoly1()
		var outRec;
		var firstLeft;
		for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++)
		{
			outRec = this.m_PolyOuts[i];
			firstLeft = ClipperLib.Clipper.ParseFirstLeft(outRec.FirstLeft);
			if (outRec.Pts !== null && firstLeft === OldOutRec)
				outRec.FirstLeft = NewOutRec;
		}
	}

	ClipperLib.Clipper.ParseFirstLeft = function (FirstLeft)
	{
		while (FirstLeft !== null && FirstLeft.Pts === null)
			FirstLeft = FirstLeft.FirstLeft;
		return FirstLeft;
	};

	ClipperLib.Clipper.prototype.JoinCommonEdges = function ()
	{
		for (var i = 0, ilen = this.m_Joins.length; i < ilen; i++)
		{
			var join = this.m_Joins[i];
			var outRec1 = this.GetOutRec(join.OutPt1.Idx);
			var outRec2 = this.GetOutRec(join.OutPt2.Idx);
			if (outRec1.Pts === null || outRec2.Pts === null)
				continue;

			if (outRec1.IsOpen || outRec2.IsOpen)
			{
				continue;
			}

			//get the polygon fragment with the correct hole state (FirstLeft)
			//before calling JoinPoints() ...
			var holeStateRec;
			if (outRec1 === outRec2)
				holeStateRec = outRec1;
			else if (this.OutRec1RightOfOutRec2(outRec1, outRec2))
				holeStateRec = outRec2;
			else if (this.OutRec1RightOfOutRec2(outRec2, outRec1))
				holeStateRec = outRec1;
			else
				holeStateRec = this.GetLowermostRec(outRec1, outRec2);

			if (!this.JoinPoints(join, outRec1, outRec2)) continue;

			if (outRec1 === outRec2)
			{
				//instead of joining two polygons, we've just created a new one by
				//splitting one polygon into two.
				outRec1.Pts = join.OutPt1;
				outRec1.BottomPt = null;
				outRec2 = this.CreateOutRec();
				outRec2.Pts = join.OutPt2;
				//update all OutRec2.Pts Idx's ...
				this.UpdateOutPtIdxs(outRec2);

				if (this.Poly2ContainsPoly1(outRec2.Pts, outRec1.Pts))
				{
					//outRec1 contains outRec2 ...
					outRec2.IsHole = !outRec1.IsHole;
					outRec2.FirstLeft = outRec1;
					if (this.m_UsingPolyTree)
						this.FixupFirstLefts2(outRec2, outRec1);
					if ((outRec2.IsHole ^ this.ReverseSolution) == (this.Area$1(outRec2) > 0))
						this.ReversePolyPtLinks(outRec2.Pts);
				}
				else if (this.Poly2ContainsPoly1(outRec1.Pts, outRec2.Pts))
				{
					//outRec2 contains outRec1 ...
					outRec2.IsHole = outRec1.IsHole;
					outRec1.IsHole = !outRec2.IsHole;
					outRec2.FirstLeft = outRec1.FirstLeft;
					outRec1.FirstLeft = outRec2;
					if (this.m_UsingPolyTree)
						this.FixupFirstLefts2(outRec1, outRec2);

					if ((outRec1.IsHole ^ this.ReverseSolution) == (this.Area$1(outRec1) > 0))
						this.ReversePolyPtLinks(outRec1.Pts);
				}
				else
				{
					//the 2 polygons are completely separate ...
					outRec2.IsHole = outRec1.IsHole;
					outRec2.FirstLeft = outRec1.FirstLeft;
					//fixup FirstLeft pointers that may need reassigning to OutRec2
					if (this.m_UsingPolyTree)
						this.FixupFirstLefts1(outRec1, outRec2);
				}
			}
			else
			{
				//joined 2 polygons together ...
				outRec2.Pts = null;
				outRec2.BottomPt = null;
				outRec2.Idx = outRec1.Idx;
				outRec1.IsHole = holeStateRec.IsHole;
				if (holeStateRec === outRec2)
					outRec1.FirstLeft = outRec2.FirstLeft;
				outRec2.FirstLeft = outRec1;
				//fixup FirstLeft pointers that may need reassigning to OutRec1
				if (this.m_UsingPolyTree)
					this.FixupFirstLefts3(outRec2, outRec1);
			}
		}
	};

	ClipperLib.Clipper.prototype.UpdateOutPtIdxs = function (outrec)
	{
		var op = outrec.Pts;
		do {
			op.Idx = outrec.Idx;
			op = op.Prev;
		}
		while (op !== outrec.Pts)
	};

	ClipperLib.Clipper.prototype.DoSimplePolygons = function ()
	{
		var i = 0;
		while (i < this.m_PolyOuts.length)
		{
			var outrec = this.m_PolyOuts[i++];
			var op = outrec.Pts;
			if (op === null || outrec.IsOpen)
				continue;
			do //for each Pt in Polygon until duplicate found do ...
			{
				var op2 = op.Next;
				while (op2 !== outrec.Pts)
				{
					if ((ClipperLib.IntPoint.op_Equality(op.Pt, op2.Pt)) && op2.Next !== op && op2.Prev !== op)
					{
						//split the polygon into two ...
						var op3 = op.Prev;
						var op4 = op2.Prev;
						op.Prev = op4;
						op4.Next = op;
						op2.Prev = op3;
						op3.Next = op2;
						outrec.Pts = op;
						var outrec2 = this.CreateOutRec();
						outrec2.Pts = op2;
						this.UpdateOutPtIdxs(outrec2);
						if (this.Poly2ContainsPoly1(outrec2.Pts, outrec.Pts))
						{
							//OutRec2 is contained by OutRec1 ...
							outrec2.IsHole = !outrec.IsHole;
							outrec2.FirstLeft = outrec;
							if (this.m_UsingPolyTree) this.FixupFirstLefts2(outrec2, outrec);

						}
						else if (this.Poly2ContainsPoly1(outrec.Pts, outrec2.Pts))
						{
							//OutRec1 is contained by OutRec2 ...
							outrec2.IsHole = outrec.IsHole;
							outrec.IsHole = !outrec2.IsHole;
							outrec2.FirstLeft = outrec.FirstLeft;
							outrec.FirstLeft = outrec2;
							if (this.m_UsingPolyTree) this.FixupFirstLefts2(outrec, outrec2);
						}
						else
						{
							//the 2 polygons are separate ...
							outrec2.IsHole = outrec.IsHole;
							outrec2.FirstLeft = outrec.FirstLeft;
							if (this.m_UsingPolyTree) this.FixupFirstLefts1(outrec, outrec2);
						}
						op2 = op;
						//ie get ready for the next iteration
					}
					op2 = op2.Next;
				}
				op = op.Next;
			}
			while (op !== outrec.Pts)
		}
	};

	ClipperLib.Clipper.Area = function (poly)
	{
		if (!Array.isArray(poly))
			return 0;
		var cnt = poly.length;
		if (cnt < 3)
			return 0;
		var a = 0;
		for (var i = 0, j = cnt - 1; i < cnt; ++i)
		{
			a += (poly[j].X + poly[i].X) * (poly[j].Y - poly[i].Y);
			j = i;
		}
		return -a * 0.5;
	};

	ClipperLib.Clipper.prototype.Area = function (op)
	{
		var opFirst = op;
		if (op === null) return 0;
		var a = 0;
		do {
			a = a + (op.Prev.Pt.X + op.Pt.X) * (op.Prev.Pt.Y - op.Pt.Y);
			op = op.Next;
		} while (op !== opFirst); // && typeof op !== 'undefined');
		return a * 0.5;
	}

	ClipperLib.Clipper.prototype.Area$1 = function (outRec)
	{
		return this.Area(outRec.Pts);
	};

	ClipperLib.Clipper.SimplifyPolygon = function (poly, fillType)
	{
		var result = new Array();
		var c = new ClipperLib.Clipper(0);
		c.StrictlySimple = true;
		c.AddPath(poly, ClipperLib.PolyType.ptSubject, true);
		c.Execute(ClipperLib.ClipType.ctUnion, result, fillType, fillType);
		return result;
	};

	ClipperLib.Clipper.SimplifyPolygons = function (polys, fillType)
	{
		if (typeof (fillType) === "undefined") fillType = ClipperLib.PolyFillType.pftEvenOdd;
		var result = new Array();
		var c = new ClipperLib.Clipper(0);
		c.StrictlySimple = true;
		c.AddPaths(polys, ClipperLib.PolyType.ptSubject, true);
		c.Execute(ClipperLib.ClipType.ctUnion, result, fillType, fillType);
		return result;
	};

	ClipperLib.Clipper.DistanceSqrd = function (pt1, pt2)
	{
		var dx = (pt1.X - pt2.X);
		var dy = (pt1.Y - pt2.Y);
		return (dx * dx + dy * dy);
	};

	ClipperLib.Clipper.DistanceFromLineSqrd = function (pt, ln1, ln2)
	{
		//The equation of a line in general form (Ax + By + C = 0)
		//given 2 points (x¹,y¹) & (x²,y²) is ...
		//(y¹ - y²)x + (x² - x¹)y + (y² - y¹)x¹ - (x² - x¹)y¹ = 0
		//A = (y¹ - y²); B = (x² - x¹); C = (y² - y¹)x¹ - (x² - x¹)y¹
		//perpendicular distance of point (x³,y³) = (Ax³ + By³ + C)/Sqrt(A² + B²)
		//see http://en.wikipedia.org/wiki/Perpendicular_distance
		var A = ln1.Y - ln2.Y;
		var B = ln2.X - ln1.X;
		var C = A * ln1.X + B * ln1.Y;
		C = A * pt.X + B * pt.Y - C;
		return (C * C) / (A * A + B * B);
	};

	ClipperLib.Clipper.SlopesNearCollinear = function (pt1, pt2, pt3, distSqrd)
	{
		//this function is more accurate when the point that's GEOMETRICALLY
		//between the other 2 points is the one that's tested for distance.
		//nb: with 'spikes', either pt1 or pt3 is geometrically between the other pts
		if (Math.abs(pt1.X - pt2.X) > Math.abs(pt1.Y - pt2.Y))
		{
			if ((pt1.X > pt2.X) === (pt1.X < pt3.X))
				return ClipperLib.Clipper.DistanceFromLineSqrd(pt1, pt2, pt3) < distSqrd;
			else if ((pt2.X > pt1.X) === (pt2.X < pt3.X))
				return ClipperLib.Clipper.DistanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
			else
				return ClipperLib.Clipper.DistanceFromLineSqrd(pt3, pt1, pt2) < distSqrd;
		}
		else
		{
			if ((pt1.Y > pt2.Y) === (pt1.Y < pt3.Y))
				return ClipperLib.Clipper.DistanceFromLineSqrd(pt1, pt2, pt3) < distSqrd;
			else if ((pt2.Y > pt1.Y) === (pt2.Y < pt3.Y))
				return ClipperLib.Clipper.DistanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
			else
				return ClipperLib.Clipper.DistanceFromLineSqrd(pt3, pt1, pt2) < distSqrd;
		}
	}

	ClipperLib.Clipper.PointsAreClose = function (pt1, pt2, distSqrd)
	{
		var dx = pt1.X - pt2.X;
		var dy = pt1.Y - pt2.Y;
		return ((dx * dx) + (dy * dy) <= distSqrd);
	};

	ClipperLib.Clipper.ExcludeOp = function (op)
	{
		var result = op.Prev;
		result.Next = op.Next;
		op.Next.Prev = result;
		result.Idx = 0;
		return result;
	};

	ClipperLib.Clipper.CleanPolygon = function (path, distance)
	{
		if (typeof (distance) === "undefined") distance = 1.415;
		//distance = proximity in units/pixels below which vertices will be stripped.
		//Default ~= sqrt(2) so when adjacent vertices or semi-adjacent vertices have
		//both x & y coords within 1 unit, then the second vertex will be stripped.
		var cnt = path.length;
		if (cnt === 0)
			return new Array();
		var outPts = new Array(cnt);
		for (var i = 0; i < cnt; ++i)
			outPts[i] = new ClipperLib.OutPt();
		for (var i = 0; i < cnt; ++i)
		{
			outPts[i].Pt = path[i];
			outPts[i].Next = outPts[(i + 1) % cnt];
			outPts[i].Next.Prev = outPts[i];
			outPts[i].Idx = 0;
		}
		var distSqrd = distance * distance;
		var op = outPts[0];
		while (op.Idx === 0 && op.Next !== op.Prev)
		{
			if (ClipperLib.Clipper.PointsAreClose(op.Pt, op.Prev.Pt, distSqrd))
			{
				op = ClipperLib.Clipper.ExcludeOp(op);
				cnt--;
			}
			else if (ClipperLib.Clipper.PointsAreClose(op.Prev.Pt, op.Next.Pt, distSqrd))
			{
				ClipperLib.Clipper.ExcludeOp(op.Next);
				op = ClipperLib.Clipper.ExcludeOp(op);
				cnt -= 2;
			}
			else if (ClipperLib.Clipper.SlopesNearCollinear(op.Prev.Pt, op.Pt, op.Next.Pt, distSqrd))
			{
				op = ClipperLib.Clipper.ExcludeOp(op);
				cnt--;
			}
			else
			{
				op.Idx = 1;
				op = op.Next;
			}
		}
		if (cnt < 3)
			cnt = 0;
		var result = new Array(cnt);
		for (var i = 0; i < cnt; ++i)
		{
			result[i] = new ClipperLib.IntPoint1(op.Pt);
			op = op.Next;
		}
		outPts = null;
		return result;
	};

	ClipperLib.Clipper.CleanPolygons = function (polys, distance)
	{
		var result = new Array(polys.length);
		for (var i = 0, ilen = polys.length; i < ilen; i++)
			result[i] = ClipperLib.Clipper.CleanPolygon(polys[i], distance);
		return result;
	};

	ClipperLib.Clipper.Minkowski = function (pattern, path, IsSum, IsClosed)
	{
		var delta = (IsClosed ? 1 : 0);
		var polyCnt = pattern.length;
		var pathCnt = path.length;
		var result = new Array();
		if (IsSum)
			for (var i = 0; i < pathCnt; i++)
			{
				var p = new Array(polyCnt);
				for (var j = 0, jlen = pattern.length, ip = pattern[j]; j < jlen; j++, ip = pattern[j])
					p[j] = new ClipperLib.IntPoint2(path[i].X + ip.X, path[i].Y + ip.Y);
				result.push(p);
			}
		else
			for (var i = 0; i < pathCnt; i++)
			{
				var p = new Array(polyCnt);
				for (var j = 0, jlen = pattern.length, ip = pattern[j]; j < jlen; j++, ip = pattern[j])
					p[j] = new ClipperLib.IntPoint2(path[i].X - ip.X, path[i].Y - ip.Y);
				result.push(p);
			}
		var quads = new Array();
		for (var i = 0; i < pathCnt - 1 + delta; i++)
			for (var j = 0; j < polyCnt; j++)
			{
				var quad = new Array();
				quad.push(result[i % pathCnt][j % polyCnt]);
				quad.push(result[(i + 1) % pathCnt][j % polyCnt]);
				quad.push(result[(i + 1) % pathCnt][(j + 1) % polyCnt]);
				quad.push(result[i % pathCnt][(j + 1) % polyCnt]);
				if (!ClipperLib.Clipper.Orientation(quad))
					quad.reverse();
				quads.push(quad);
			}
		return quads;
	};

	ClipperLib.Clipper.MinkowskiSum = function (pattern, path_or_paths, pathIsClosed)
	{
		if (!(path_or_paths[0] instanceof Array))
		{
			var path = path_or_paths;
			var paths = ClipperLib.Clipper.Minkowski(pattern, path, true, pathIsClosed);
			var c = new ClipperLib.Clipper();
			c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
			c.Execute(ClipperLib.ClipType.ctUnion, paths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
			return paths;
		}
		else
		{
			var paths = path_or_paths;
			var solution = new ClipperLib.Paths();
			var c = new ClipperLib.Clipper();
			for (var i = 0; i < paths.length; ++i)
			{
				var tmp = ClipperLib.Clipper.Minkowski(pattern, paths[i], true, pathIsClosed);
				c.AddPaths(tmp, ClipperLib.PolyType.ptSubject, true);
				if (pathIsClosed)
				{
					var path = ClipperLib.Clipper.TranslatePath(paths[i], pattern[0]);
					c.AddPath(path, ClipperLib.PolyType.ptClip, true);
				}
			}
			c.Execute(ClipperLib.ClipType.ctUnion, solution,
				ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
			return solution;
		}
	}

	ClipperLib.Clipper.TranslatePath = function (path, delta)
	{
		var outPath = new ClipperLib.Path();
		for (var i = 0; i < path.length; i++)
			outPath.push(new ClipperLib.IntPoint2(path[i].X + delta.X, path[i].Y + delta.Y));
		return outPath;
	}

	ClipperLib.Clipper.MinkowskiDiff = function (poly1, poly2)
	{
		var paths = ClipperLib.Clipper.Minkowski(poly1, poly2, false, true);
		var c = new ClipperLib.Clipper();
		c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
		c.Execute(ClipperLib.ClipType.ctUnion, paths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
		return paths;
	}

	ClipperLib.Clipper.PolyTreeToPaths = function (polytree)
	{
		var result = new Array();
		//result.set_Capacity(polytree.get_Total());
		ClipperLib.Clipper.AddPolyNodeToPaths(polytree, ClipperLib.Clipper.NodeType.ntAny, result);
		return result;
	};

	ClipperLib.Clipper.AddPolyNodeToPaths = function (polynode, nt, paths)
	{
		var match = true;
		switch (nt)
		{
		case ClipperLib.Clipper.NodeType.ntOpen:
			return;
		case ClipperLib.Clipper.NodeType.ntClosed:
			match = !polynode.IsOpen;
			break;
		default:
			break;
		}
		if (polynode.m_polygon.length > 0 && match)
			paths.push(polynode.m_polygon);
		for (var $i3 = 0, $t3 = polynode.Childs(), $l3 = $t3.length, pn = $t3[$i3]; $i3 < $l3; $i3++, pn = $t3[$i3])
			ClipperLib.Clipper.AddPolyNodeToPaths(pn, nt, paths);
	};

	ClipperLib.Clipper.OpenPathsFromPolyTree = function (polytree)
	{
		var result = new ClipperLib.Paths();
		//result.set_Capacity(polytree.ChildCount());
		for (var i = 0, ilen = polytree.ChildCount(); i < ilen; i++)
			if (polytree.Childs()[i].IsOpen)
				result.push(polytree.Childs()[i].m_polygon);
		return result;
	};

	ClipperLib.Clipper.ClosedPathsFromPolyTree = function (polytree)
	{
		var result = new ClipperLib.Paths();
		//result.set_Capacity(polytree.Total());
		ClipperLib.Clipper.AddPolyNodeToPaths(polytree, ClipperLib.Clipper.NodeType.ntClosed, result);
		return result;
	};

	Inherit(ClipperLib.Clipper, ClipperLib.ClipperBase);
	ClipperLib.Clipper.NodeType = {
		ntAny: 0,
		ntOpen: 1,
		ntClosed: 2
	};

	/**
	* @constructor
	*/
	ClipperLib.ClipperOffset = function (miterLimit, arcTolerance)
	{
		if (typeof (miterLimit) === "undefined") miterLimit = 2;
		if (typeof (arcTolerance) === "undefined") arcTolerance = ClipperLib.ClipperOffset.def_arc_tolerance;
		this.m_destPolys = new ClipperLib.Paths();
		this.m_srcPoly = new ClipperLib.Path();
		this.m_destPoly = new ClipperLib.Path();
		this.m_normals = new Array();
		this.m_delta = 0;
		this.m_sinA = 0;
		this.m_sin = 0;
		this.m_cos = 0;
		this.m_miterLim = 0;
		this.m_StepsPerRad = 0;
		this.m_lowest = new ClipperLib.IntPoint0();
		this.m_polyNodes = new ClipperLib.PolyNode();
		this.MiterLimit = miterLimit;
		this.ArcTolerance = arcTolerance;
		this.m_lowest.X = -1;
	};

	ClipperLib.ClipperOffset.two_pi = 6.28318530717959;
	ClipperLib.ClipperOffset.def_arc_tolerance = 0.25;
	ClipperLib.ClipperOffset.prototype.Clear = function ()
	{
		ClipperLib.Clear(this.m_polyNodes.Childs());
		this.m_lowest.X = -1;
	};

	ClipperLib.ClipperOffset.Round = ClipperLib.Clipper.Round;
	ClipperLib.ClipperOffset.prototype.AddPath = function (path, joinType, endType)
	{
		var highI = path.length - 1;
		if (highI < 0)
			return;
		var newNode = new ClipperLib.PolyNode();
		newNode.m_jointype = joinType;
		newNode.m_endtype = endType;
		//strip duplicate points from path and also get index to the lowest point ...
		if (endType === ClipperLib.EndType.etClosedLine || endType === ClipperLib.EndType.etClosedPolygon)
			while (highI > 0 && ClipperLib.IntPoint.op_Equality(path[0], path[highI]))
				highI--;
		//newNode.m_polygon.set_Capacity(highI + 1);
		newNode.m_polygon.push(path[0]);
		var j = 0,
			k = 0;
		for (var i = 1; i <= highI; i++)
			if (ClipperLib.IntPoint.op_Inequality(newNode.m_polygon[j], path[i]))
			{
				j++;
				newNode.m_polygon.push(path[i]);
				if (path[i].Y > newNode.m_polygon[k].Y || (path[i].Y === newNode.m_polygon[k].Y && path[i].X < newNode.m_polygon[k].X))
					k = j;
			}
		if (endType === ClipperLib.EndType.etClosedPolygon && j < 2) return;

		this.m_polyNodes.AddChild(newNode);
		//if this path's lowest pt is lower than all the others then update m_lowest
		if (endType !== ClipperLib.EndType.etClosedPolygon)
			return;
		if (this.m_lowest.X < 0)
			this.m_lowest = new ClipperLib.IntPoint2(this.m_polyNodes.ChildCount() - 1, k);
		else
		{
			var ip = this.m_polyNodes.Childs()[this.m_lowest.X].m_polygon[this.m_lowest.Y];
			if (newNode.m_polygon[k].Y > ip.Y || (newNode.m_polygon[k].Y === ip.Y && newNode.m_polygon[k].X < ip.X))
				this.m_lowest = new ClipperLib.IntPoint2(this.m_polyNodes.ChildCount() - 1, k);
		}
	};

	ClipperLib.ClipperOffset.prototype.AddPaths = function (paths, joinType, endType)
	{
		for (var i = 0, ilen = paths.length; i < ilen; i++)
			this.AddPath(paths[i], joinType, endType);
	};

	ClipperLib.ClipperOffset.prototype.FixOrientations = function ()
	{
		//fixup orientations of all closed paths if the orientation of the
		//closed path with the lowermost vertex is wrong ...
		if (this.m_lowest.X >= 0 && !ClipperLib.Clipper.Orientation(this.m_polyNodes.Childs()[this.m_lowest.X].m_polygon))
		{
			for (var i = 0; i < this.m_polyNodes.ChildCount(); i++)
			{
				var node = this.m_polyNodes.Childs()[i];
				if (node.m_endtype === ClipperLib.EndType.etClosedPolygon || (node.m_endtype === ClipperLib.EndType.etClosedLine && ClipperLib.Clipper.Orientation(node.m_polygon)))
					node.m_polygon.reverse();
			}
		}
		else
		{
			for (var i = 0; i < this.m_polyNodes.ChildCount(); i++)
			{
				var node = this.m_polyNodes.Childs()[i];
				if (node.m_endtype === ClipperLib.EndType.etClosedLine && !ClipperLib.Clipper.Orientation(node.m_polygon))
					node.m_polygon.reverse();
			}
		}
	};

	ClipperLib.ClipperOffset.GetUnitNormal = function (pt1, pt2)
	{
		var dx = (pt2.X - pt1.X);
		var dy = (pt2.Y - pt1.Y);
		if ((dx === 0) && (dy === 0))
			return new ClipperLib.DoublePoint2(0, 0);
		var f = 1 / Math.sqrt(dx * dx + dy * dy);
		dx *= f;
		dy *= f;
		return new ClipperLib.DoublePoint2(dy, -dx);
	};

	ClipperLib.ClipperOffset.prototype.DoOffset = function (delta)
	{
		this.m_destPolys = new Array();
		this.m_delta = delta;
		//if Zero offset, just copy any CLOSED polygons to m_p and return ...
		if (ClipperLib.ClipperBase.near_zero(delta))
		{
			//this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount);
			for (var i = 0; i < this.m_polyNodes.ChildCount(); i++)
			{
				var node = this.m_polyNodes.Childs()[i];
				if (node.m_endtype === ClipperLib.EndType.etClosedPolygon)
					this.m_destPolys.push(node.m_polygon);
			}
			return;
		}
		//see offset_triginometry3.svg in the documentation folder ...
		if (this.MiterLimit > 2)
			this.m_miterLim = 2 / (this.MiterLimit * this.MiterLimit);
		else
			this.m_miterLim = 0.5;
		var y;
		if (this.ArcTolerance <= 0)
			y = ClipperLib.ClipperOffset.def_arc_tolerance;
		else if (this.ArcTolerance > Math.abs(delta) * ClipperLib.ClipperOffset.def_arc_tolerance)
			y = Math.abs(delta) * ClipperLib.ClipperOffset.def_arc_tolerance;
		else
			y = this.ArcTolerance;
		//see offset_triginometry2.svg in the documentation folder ...
		var steps = 3.14159265358979 / Math.acos(1 - y / Math.abs(delta));
		this.m_sin = Math.sin(ClipperLib.ClipperOffset.two_pi / steps);
		this.m_cos = Math.cos(ClipperLib.ClipperOffset.two_pi / steps);
		this.m_StepsPerRad = steps / ClipperLib.ClipperOffset.two_pi;
		if (delta < 0)
			this.m_sin = -this.m_sin;
		//this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
		for (var i = 0; i < this.m_polyNodes.ChildCount(); i++)
		{
			var node = this.m_polyNodes.Childs()[i];
			this.m_srcPoly = node.m_polygon;
			var len = this.m_srcPoly.length;
			if (len === 0 || (delta <= 0 && (len < 3 || node.m_endtype !== ClipperLib.EndType.etClosedPolygon)))
				continue;
			this.m_destPoly = new Array();
			if (len === 1)
			{
				if (node.m_jointype === ClipperLib.JoinType.jtRound)
				{
					var X = 1,
						Y = 0;
					for (var j = 1; j <= steps; j++)
					{
						this.m_destPoly.push(new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X + X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y + Y * delta)));
						var X2 = X;
						X = X * this.m_cos - this.m_sin * Y;
						Y = X2 * this.m_sin + Y * this.m_cos;
					}
				}
				else
				{
					var X = -1,
						Y = -1;
					for (var j = 0; j < 4; ++j)
					{
						this.m_destPoly.push(new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X + X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y + Y * delta)));
						if (X < 0)
							X = 1;
						else if (Y < 0)
							Y = 1;
						else
							X = -1;
					}
				}
				this.m_destPolys.push(this.m_destPoly);
				continue;
			}
			//build m_normals ...
			this.m_normals.length = 0;
			//this.m_normals.set_Capacity(len);
			for (var j = 0; j < len - 1; j++)
				this.m_normals.push(ClipperLib.ClipperOffset.GetUnitNormal(this.m_srcPoly[j], this.m_srcPoly[j + 1]));
			if (node.m_endtype === ClipperLib.EndType.etClosedLine || node.m_endtype === ClipperLib.EndType.etClosedPolygon)
				this.m_normals.push(ClipperLib.ClipperOffset.GetUnitNormal(this.m_srcPoly[len - 1], this.m_srcPoly[0]));
			else
				this.m_normals.push(new ClipperLib.DoublePoint1(this.m_normals[len - 2]));
			if (node.m_endtype === ClipperLib.EndType.etClosedPolygon)
			{
				var k = len - 1;
				for (var j = 0; j < len; j++)
					k = this.OffsetPoint(j, k, node.m_jointype);
				this.m_destPolys.push(this.m_destPoly);
			}
			else if (node.m_endtype === ClipperLib.EndType.etClosedLine)
			{
				var k = len - 1;
				for (var j = 0; j < len; j++)
					k = this.OffsetPoint(j, k, node.m_jointype);
				this.m_destPolys.push(this.m_destPoly);
				this.m_destPoly = new Array();
				//re-build m_normals ...
				var n = this.m_normals[len - 1];
				for (var j = len - 1; j > 0; j--)
					this.m_normals[j] = new ClipperLib.DoublePoint2(-this.m_normals[j - 1].X, -this.m_normals[j - 1].Y);
				this.m_normals[0] = new ClipperLib.DoublePoint2(-n.X, -n.Y);
				k = 0;
				for (var j = len - 1; j >= 0; j--)
					k = this.OffsetPoint(j, k, node.m_jointype);
				this.m_destPolys.push(this.m_destPoly);
			}
			else
			{
				var k = 0;
				for (var j = 1; j < len - 1; ++j)
					k = this.OffsetPoint(j, k, node.m_jointype);
				var pt1;
				if (node.m_endtype === ClipperLib.EndType.etOpenButt)
				{
					var j = len - 1;
					pt1 = new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[j].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[j].Y * delta));
					this.m_destPoly.push(pt1);
					pt1 = new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X - this.m_normals[j].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y - this.m_normals[j].Y * delta));
					this.m_destPoly.push(pt1);
				}
				else
				{
					var j = len - 1;
					k = len - 2;
					this.m_sinA = 0;
					this.m_normals[j] = new ClipperLib.DoublePoint2(-this.m_normals[j].X, -this.m_normals[j].Y);
					if (node.m_endtype === ClipperLib.EndType.etOpenSquare)
						this.DoSquare(j, k);
					else
						this.DoRound(j, k);
				}
				//re-build m_normals ...
				for (var j = len - 1; j > 0; j--)
					this.m_normals[j] = new ClipperLib.DoublePoint2(-this.m_normals[j - 1].X, -this.m_normals[j - 1].Y);
				this.m_normals[0] = new ClipperLib.DoublePoint2(-this.m_normals[1].X, -this.m_normals[1].Y);
				k = len - 1;
				for (var j = k - 1; j > 0; --j)
					k = this.OffsetPoint(j, k, node.m_jointype);
				if (node.m_endtype === ClipperLib.EndType.etOpenButt)
				{
					pt1 = new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X - this.m_normals[0].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y - this.m_normals[0].Y * delta));
					this.m_destPoly.push(pt1);
					pt1 = new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].X + this.m_normals[0].X * delta), ClipperLib.ClipperOffset.Round(this.m_srcPoly[0].Y + this.m_normals[0].Y * delta));
					this.m_destPoly.push(pt1);
				}
				else
				{
					k = 1;
					this.m_sinA = 0;
					if (node.m_endtype === ClipperLib.EndType.etOpenSquare)
						this.DoSquare(0, 1);
					else
						this.DoRound(0, 1);
				}
				this.m_destPolys.push(this.m_destPoly);
			}
		}
	};

	ClipperLib.ClipperOffset.prototype.Execute = function ()
	{
		var a = arguments,
			ispolytree = a[0] instanceof ClipperLib.PolyTree;
		if (!ispolytree) // function (solution, delta)
		{
			var solution = a[0],
				delta = a[1];
			ClipperLib.Clear(solution);
			this.FixOrientations();
			this.DoOffset(delta);
			//now clean up 'corners' ...
			var clpr = new ClipperLib.Clipper(0);
			clpr.AddPaths(this.m_destPolys, ClipperLib.PolyType.ptSubject, true);
			if (delta > 0)
			{
				clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
			}
			else
			{
				var r = ClipperLib.Clipper.GetBounds(this.m_destPolys);
				var outer = new ClipperLib.Path();
				outer.push(new ClipperLib.IntPoint2(r.left - 10, r.bottom + 10));
				outer.push(new ClipperLib.IntPoint2(r.right + 10, r.bottom + 10));
				outer.push(new ClipperLib.IntPoint2(r.right + 10, r.top - 10));
				outer.push(new ClipperLib.IntPoint2(r.left - 10, r.top - 10));
				clpr.AddPath(outer, ClipperLib.PolyType.ptSubject, true);
				clpr.ReverseSolution = true;
				clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftNegative, ClipperLib.PolyFillType.pftNegative);
				if (solution.length > 0)
					solution.splice(0, 1);
			}
			//console.log(JSON.stringify(solution));
		}
		else // function (polytree, delta)
		{
			var solution = a[0],
				delta = a[1];
			solution.Clear();
			this.FixOrientations();
			this.DoOffset(delta);
			//now clean up 'corners' ...
			var clpr = new ClipperLib.Clipper(0);
			clpr.AddPaths(this.m_destPolys, ClipperLib.PolyType.ptSubject, true);
			if (delta > 0)
			{
				clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
			}
			else
			{
				var r = ClipperLib.Clipper.GetBounds(this.m_destPolys);
				var outer = new ClipperLib.Path();
				outer.push(new ClipperLib.IntPoint2(r.left - 10, r.bottom + 10));
				outer.push(new ClipperLib.IntPoint2(r.right + 10, r.bottom + 10));
				outer.push(new ClipperLib.IntPoint2(r.right + 10, r.top - 10));
				outer.push(new ClipperLib.IntPoint2(r.left - 10, r.top - 10));
				clpr.AddPath(outer, ClipperLib.PolyType.ptSubject, true);
				clpr.ReverseSolution = true;
				clpr.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftNegative, ClipperLib.PolyFillType.pftNegative);
				//remove the outer PolyNode rectangle ...
				if (solution.ChildCount() === 1 && solution.Childs()[0].ChildCount() > 0)
				{
					var outerNode = solution.Childs()[0];
					//solution.Childs.set_Capacity(outerNode.ChildCount);
					solution.Childs()[0] = outerNode.Childs()[0];
					solution.Childs()[0].m_Parent = solution;
					for (var i = 1; i < outerNode.ChildCount(); i++)
						solution.AddChild(outerNode.Childs()[i]);
				}
				else
					solution.Clear();
			}
		}
	};

	ClipperLib.ClipperOffset.prototype.OffsetPoint = function (j, k, jointype)
	{
		//cross product ...
		this.m_sinA = (this.m_normals[k].X * this.m_normals[j].Y - this.m_normals[j].X * this.m_normals[k].Y);

		if (Math.abs(this.m_sinA * this.m_delta) < 1.0)
		{
			//dot product ...
			var cosA = (this.m_normals[k].X * this.m_normals[j].X + this.m_normals[j].Y * this.m_normals[k].Y);
			if (cosA > 0) // angle ==> 0 degrees
			{
				this.m_destPoly.push(new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[k].X * this.m_delta),
					ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[k].Y * this.m_delta)));
				return k;
			}
			//else angle ==> 180 degrees
		}
		else if (this.m_sinA > 1)
			this.m_sinA = 1.0;
		else if (this.m_sinA < -1)
			this.m_sinA = -1.0;
		if (this.m_sinA * this.m_delta < 0)
		{
			this.m_destPoly.push(new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[k].X * this.m_delta),
				ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[k].Y * this.m_delta)));
			this.m_destPoly.push(new ClipperLib.IntPoint1(this.m_srcPoly[j]));
			this.m_destPoly.push(new ClipperLib.IntPoint2(ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[j].X * this.m_delta),
				ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[j].Y * this.m_delta)));
		}
		else
			switch (jointype)
			{
			case ClipperLib.JoinType.jtMiter:
				{
					var r = 1 + (this.m_normals[j].X * this.m_normals[k].X + this.m_normals[j].Y * this.m_normals[k].Y);
					if (r >= this.m_miterLim)
						this.DoMiter(j, k, r);
					else
						this.DoSquare(j, k);
					break;
				}
			case ClipperLib.JoinType.jtSquare:
				this.DoSquare(j, k);
				break;
			case ClipperLib.JoinType.jtRound:
				this.DoRound(j, k);
				break;
			}
		k = j;
		return k;
	};

	ClipperLib.ClipperOffset.prototype.DoSquare = function (j, k)
	{
		var dx = Math.tan(Math.atan2(this.m_sinA,
			this.m_normals[k].X * this.m_normals[j].X + this.m_normals[k].Y * this.m_normals[j].Y) / 4);
		this.m_destPoly.push(new ClipperLib.IntPoint2(
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_delta * (this.m_normals[k].X - this.m_normals[k].Y * dx)),
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_delta * (this.m_normals[k].Y + this.m_normals[k].X * dx))));
		this.m_destPoly.push(new ClipperLib.IntPoint2(
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_delta * (this.m_normals[j].X + this.m_normals[j].Y * dx)),
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_delta * (this.m_normals[j].Y - this.m_normals[j].X * dx))));
	};

	ClipperLib.ClipperOffset.prototype.DoMiter = function (j, k, r)
	{
		var q = this.m_delta / r;
		this.m_destPoly.push(new ClipperLib.IntPoint2(
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + (this.m_normals[k].X + this.m_normals[j].X) * q),
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + (this.m_normals[k].Y + this.m_normals[j].Y) * q)));
	};

	ClipperLib.ClipperOffset.prototype.DoRound = function (j, k)
	{
		var a = Math.atan2(this.m_sinA,
			this.m_normals[k].X * this.m_normals[j].X + this.m_normals[k].Y * this.m_normals[j].Y);

		var steps = Math.max(ClipperLib.Cast_Int32(ClipperLib.ClipperOffset.Round(this.m_StepsPerRad * Math.abs(a))), 1);

		var X = this.m_normals[k].X,
			Y = this.m_normals[k].Y,
			X2;
		for (var i = 0; i < steps; ++i)
		{
			this.m_destPoly.push(new ClipperLib.IntPoint2(
				ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + X * this.m_delta),
				ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + Y * this.m_delta)));
			X2 = X;
			X = X * this.m_cos - this.m_sin * Y;
			Y = X2 * this.m_sin + Y * this.m_cos;
		}
		this.m_destPoly.push(new ClipperLib.IntPoint2(
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].X + this.m_normals[j].X * this.m_delta),
			ClipperLib.ClipperOffset.Round(this.m_srcPoly[j].Y + this.m_normals[j].Y * this.m_delta)));
	};

	ClipperLib.Error = function (message)
	{
		try
		{
			throw new Error(message);
		}
		catch (err)
		{
			alert(err.message);
		}
	};

	// ---------------------------------------------

	// JS extension by Timo 2013
	ClipperLib.JS = {};

	ClipperLib.JS.AreaOfPolygon = function (poly, scale)
	{
		if (!scale) scale = 1;
		return ClipperLib.Clipper.Area(poly) / (scale * scale);
	};

	ClipperLib.JS.AreaOfPolygons = function (poly, scale)
	{
		if (!scale) scale = 1;
		var area = 0;
		for (var i = 0; i < poly.length; i++)
		{
			area += ClipperLib.Clipper.Area(poly[i]);
		}
		return area / (scale * scale);
	};

	ClipperLib.JS.BoundsOfPath = function (path, scale)
	{
		return ClipperLib.JS.BoundsOfPaths([path], scale);
	};

	ClipperLib.JS.BoundsOfPaths = function (paths, scale)
	{
		if (!scale) scale = 1;
		var bounds = ClipperLib.Clipper.GetBounds(paths);
		bounds.left /= scale;
		bounds.bottom /= scale;
		bounds.right /= scale;
		bounds.top /= scale;
		return bounds;
	};

	// Clean() joins vertices that are too near each other
	// and causes distortion to offsetted polygons without cleaning
	ClipperLib.JS.Clean = function (polygon, delta)
	{
		if (!(polygon instanceof Array)) return [];
		var isPolygons = polygon[0] instanceof Array;
		var polygon = ClipperLib.JS.Clone(polygon);
		if (typeof delta !== "number" || delta === null)
		{
			ClipperLib.Error("Delta is not a number in Clean().");
			return polygon;
		}
		if (polygon.length === 0 || (polygon.length === 1 && polygon[0].length === 0) || delta < 0) return polygon;
		if (!isPolygons) polygon = [polygon];
		var k_length = polygon.length;
		var len, poly, result, d, p, j, i;
		var results = [];
		for (var k = 0; k < k_length; k++)
		{
			poly = polygon[k];
			len = poly.length;
			if (len === 0) continue;
			else if (len < 3)
			{
				result = poly;
				results.push(result);
				continue;
			}
			result = poly;
			d = delta * delta;
			//d = Math.floor(c_delta * c_delta);
			p = poly[0];
			j = 1;
			for (i = 1; i < len; i++)
			{
				if ((poly[i].X - p.X) * (poly[i].X - p.X) +
					(poly[i].Y - p.Y) * (poly[i].Y - p.Y) <= d)
					continue;
				result[j] = poly[i];
				p = poly[i];
				j++;
			}
			p = poly[j - 1];
			if ((poly[0].X - p.X) * (poly[0].X - p.X) +
				(poly[0].Y - p.Y) * (poly[0].Y - p.Y) <= d)
				j--;
			if (j < len)
				result.splice(j, len - j);
			if (result.length) results.push(result);
		}
		if (!isPolygons && results.length) results = results[0];
		else if (!isPolygons && results.length === 0) results = [];
		else if (isPolygons && results.length === 0) results = [
			[]
		];
		return results;
	}
	// Make deep copy of Polygons or Polygon
	// so that also IntPoint objects are cloned and not only referenced
	// This should be the fastest way
	ClipperLib.JS.Clone = function (polygon)
	{
		if (!(polygon instanceof Array)) return [];
		if (polygon.length === 0) return [];
		else if (polygon.length === 1 && polygon[0].length === 0) return [
			[]
		];
		var isPolygons = polygon[0] instanceof Array;
		if (!isPolygons) polygon = [polygon];
		var len = polygon.length,
			plen, i, j, result;
		var results = new Array(len);
		for (i = 0; i < len; i++)
		{
			plen = polygon[i].length;
			result = new Array(plen);
			for (j = 0; j < plen; j++)
			{
				result[j] = {
					X: polygon[i][j].X,
					Y: polygon[i][j].Y
				};

			}
			results[i] = result;
		}
		if (!isPolygons) results = results[0];
		return results;
	};

	// Removes points that doesn't affect much to the visual appearance.
	// If middle point is at or under certain distance (tolerance) of the line segment between
	// start and end point, the middle point is removed.
	ClipperLib.JS.Lighten = function (polygon, tolerance)
	{
		if (!(polygon instanceof Array)) return [];
		if (typeof tolerance !== "number" || tolerance === null)
		{
			ClipperLib.Error("Tolerance is not a number in Lighten().")
			return ClipperLib.JS.Clone(polygon);
		}
		if (polygon.length === 0 || (polygon.length === 1 && polygon[0].length === 0) || tolerance < 0)
		{
			return ClipperLib.JS.Clone(polygon);
		}
		var isPolygons = polygon[0] instanceof Array;
		if (!isPolygons) polygon = [polygon];
		var i, j, poly, k, poly2, plen, A, B, P, d, rem, addlast;
		var bxax, byay, l, ax, ay;
		var len = polygon.length;
		var toleranceSq = tolerance * tolerance;
		var results = [];
		for (i = 0; i < len; i++)
		{
			poly = polygon[i];
			plen = poly.length;
			if (plen === 0) continue;
			for (k = 0; k < 1000000; k++) // could be forever loop, but wiser to restrict max repeat count
			{
				poly2 = [];
				plen = poly.length;
				// the first have to added to the end, if first and last are not the same
				// this way we ensure that also the actual last point can be removed if needed
				if (poly[plen - 1].X !== poly[0].X || poly[plen - 1].Y !== poly[0].Y)
				{
					addlast = 1;
					poly.push(
					{
						X: poly[0].X,
						Y: poly[0].Y
					});
					plen = poly.length;
				}
				else addlast = 0;
				rem = []; // Indexes of removed points
				for (j = 0; j < plen - 2; j++)
				{
					A = poly[j]; // Start point of line segment
					P = poly[j + 1]; // Middle point. This is the one to be removed.
					B = poly[j + 2]; // End point of line segment
					ax = A.X;
					ay = A.Y;
					bxax = B.X - ax;
					byay = B.Y - ay;
					if (bxax !== 0 || byay !== 0) // To avoid Nan, when A==P && P==B. And to avoid peaks (A==B && A!=P), which have lenght, but not area.
					{
						l = ((P.X - ax) * bxax + (P.Y - ay) * byay) / (bxax * bxax + byay * byay);
						if (l > 1)
						{
							ax = B.X;
							ay = B.Y;
						}
						else if (l > 0)
						{
							ax += bxax * l;
							ay += byay * l;
						}
					}
					bxax = P.X - ax;
					byay = P.Y - ay;
					d = bxax * bxax + byay * byay;
					if (d <= toleranceSq)
					{
						rem[j + 1] = 1;
						j++; // when removed, transfer the pointer to the next one
					}
				}
				// add all unremoved points to poly2
				poly2.push(
				{
					X: poly[0].X,
					Y: poly[0].Y
				});
				for (j = 1; j < plen - 1; j++)
					if (!rem[j]) poly2.push(
					{
						X: poly[j].X,
						Y: poly[j].Y
					});
				poly2.push(
				{
					X: poly[plen - 1].X,
					Y: poly[plen - 1].Y
				});
				// if the first point was added to the end, remove it
				if (addlast) poly.pop();
				// break, if there was not anymore removed points
				if (!rem.length) break;
				// else continue looping using poly2, to check if there are points to remove
				else poly = poly2;
			}
			plen = poly2.length;
			// remove duplicate from end, if needed
			if (poly2[plen - 1].X === poly2[0].X && poly2[plen - 1].Y === poly2[0].Y)
			{
				poly2.pop();
			}
			if (poly2.length > 2) // to avoid two-point-polygons
				results.push(poly2);
		}
		if (!isPolygons)
		{
			results = results[0];
		}
		if (typeof (results) === "undefined")
		{
			results = [];
		}
		return results;
	}

	ClipperLib.JS.PerimeterOfPath = function (path, closed, scale)
	{
		if (typeof (path) === "undefined") return 0;
		var sqrt = Math.sqrt;
		var perimeter = 0.0;
		var p1, p2, p1x = 0.0,
			p1y = 0.0,
			p2x = 0.0,
			p2y = 0.0;
		var j = path.length;
		if (j < 2) return 0;
		if (closed)
		{
			path[j] = path[0];
			j++;
		}
		while (--j)
		{
			p1 = path[j];
			p1x = p1.X;
			p1y = p1.Y;
			p2 = path[j - 1];
			p2x = p2.X;
			p2y = p2.Y;
			perimeter += sqrt((p1x - p2x) * (p1x - p2x) + (p1y - p2y) * (p1y - p2y));
		}
		if (closed) path.pop();
		return perimeter / scale;
	};

	ClipperLib.JS.PerimeterOfPaths = function (paths, closed, scale)
	{
		if (!scale) scale = 1;
		var perimeter = 0;
		for (var i = 0; i < paths.length; i++)
		{
			perimeter += ClipperLib.JS.PerimeterOfPath(paths[i], closed, scale);
		}
		return perimeter;
	};

	ClipperLib.JS.ScaleDownPath = function (path, scale)
	{
		var i, p;
		if (!scale) scale = 1;
		i = path.length;
		while (i--)
		{
			p = path[i];
			p.X = p.X / scale;
			p.Y = p.Y / scale;
		}
	};

	ClipperLib.JS.ScaleDownPaths = function (paths, scale)
	{
		var i, j, p;
		if (!scale) scale = 1;
		i = paths.length;
		while (i--)
		{
			j = paths[i].length;
			while (j--)
			{
				p = paths[i][j];
				p.X = p.X / scale;
				p.Y = p.Y / scale;
			}
		}
	};

	ClipperLib.JS.ScaleUpPath = function (path, scale)
	{
		var i, p, round = Math.round;
		if (!scale) scale = 1;
		i = path.length;
		while (i--)
		{
			p = path[i];
			p.X = round(p.X * scale);
			p.Y = round(p.Y * scale);
		}
	};

	ClipperLib.JS.ScaleUpPaths = function (paths, scale)
	{
		var i, j, p, round = Math.round;
		if (!scale) scale = 1;
		i = paths.length;
		while (i--)
		{
			j = paths[i].length;
			while (j--)
			{
				p = paths[i][j];
				p.X = round(p.X * scale);
				p.Y = round(p.Y * scale);
			}
		}
	};

	/**
	* @constructor
	*/
	ClipperLib.ExPolygons = function ()
	{
		return [];
	}
	/**
	* @constructor
	*/
	ClipperLib.ExPolygon = function ()
	{
		this.outer = null;
		this.holes = null;
	};

	ClipperLib.JS.AddOuterPolyNodeToExPolygons = function (polynode, expolygons)
	{
		var ep = new ClipperLib.ExPolygon();
		ep.outer = polynode.Contour();
		var childs = polynode.Childs();
		var ilen = childs.length;
		ep.holes = new Array(ilen);
		var node, n, i, j, childs2, jlen;
		for (i = 0; i < ilen; i++)
		{
			node = childs[i];
			ep.holes[i] = node.Contour();
			//Add outer polygons contained by (nested within) holes ...
			for (j = 0, childs2 = node.Childs(), jlen = childs2.length; j < jlen; j++)
			{
				n = childs2[j];
				ClipperLib.JS.AddOuterPolyNodeToExPolygons(n, expolygons);
			}
		}
		expolygons.push(ep);
	};

	ClipperLib.JS.ExPolygonsToPaths = function (expolygons)
	{
		var a, i, alen, ilen;
		var paths = new ClipperLib.Paths();
		for (a = 0, alen = expolygons.length; a < alen; a++)
		{
			paths.push(expolygons[a].outer);
			for (i = 0, ilen = expolygons[a].holes.length; i < ilen; i++)
			{
				paths.push(expolygons[a].holes[i]);
			}
		}
		return paths;
	}
	ClipperLib.JS.PolyTreeToExPolygons = function (polytree)
	{
		var expolygons = new ClipperLib.ExPolygons();
		var node, i, childs, ilen;
		for (i = 0, childs = polytree.Childs(), ilen = childs.length; i < ilen; i++)
		{
			node = childs[i];
			ClipperLib.JS.AddOuterPolyNodeToExPolygons(node, expolygons);
		}
		return expolygons;
	};

})();

// Feeds and speeds for high-efficiency machining: end mills (HEM, profiling, slotting), ball end mills, high-feed
// mills, face mills, drills, taps and reamers. Inch. Numbers are starting points for the material and tool; every
// one can be overridden. Works in the browser (window.FEEDS) and in Node (require('./lib/feeds.js')).
//
//   const r = FEEDS.calc({ tool: 'endmill', mat: 'a36', D: 0.5, Z: 4, op: 'hem' });
//   r.rpm, r.feed, r.fzProg, r.hp, r.warnings ...
(function (root) {
  'use strict';
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const PI = Math.PI;
  const SFM_RPM = 12 / PI;                     // rpm = SFM × 3.82 / D

  // Starting points per material.
  //   hp    horsepower per cubic inch per minute at the cutter (unit power)
  //   em    solid carbide end mills: sfm (HEM), k = real chip per tooth as a fraction of D (HEM roughing)
  //   ind   indexable carbide inserts (face and high-feed mills): sfm, hex = actual chip thickness
  //   drill sfm, carbide and HSS; fd scales the feed per rev (carbide 0.0015 + 0.015 D, HSS 0.001 + 0.012 D)
  //   tap   HSS cut-tap sfm (form taps +25%, carbide ×2); form: whether forming is advised
  //   ream  carbide reamer sfm and feed per rev as a fraction of D
  const MATERIALS = {
    a36:    { name: 'A36 / 1018 mild steel',      hp: 1.0, em: { sfm: 575, k: 0.0042 },  ind: { sfm: 800, hex: 0.006 },  drill: { sfm: 300, sfmHss: 90, fd: 1.0 },  tap: { sfm: 40, form: true },  ream: { sfm: 150, kr: 0.02 } },
    s1045:  { name: '1045 medium carbon steel',   hp: 1.1, em: { sfm: 480, k: 0.004 }, ind: { sfm: 700, hex: 0.0055 }, drill: { sfm: 260, sfmHss: 75, fd: 0.9 },  tap: { sfm: 30, form: true },  ream: { sfm: 130, kr: 0.018 } },
    s4140:  { name: '4140 prehard (~30 HRC)',     hp: 1.3, em: { sfm: 380, k: 0.0036 },  ind: { sfm: 600, hex: 0.005 },  drill: { sfm: 220, sfmHss: 60, fd: 0.8 },  tap: { sfm: 25, form: true },  ream: { sfm: 110, kr: 0.016 } },
    tool:   { name: 'Tool steel, annealed (A2, D2)', hp: 1.4, em: { sfm: 300, k: 0.0032 }, ind: { sfm: 450, hex: 0.005 }, drill: { sfm: 180, sfmHss: 50, fd: 0.7 }, tap: { sfm: 15, form: false }, ream: { sfm: 90, kr: 0.014 } },
    ss304:  { name: '304 / 316 stainless',        hp: 1.4, em: { sfm: 350, k: 0.0032 }, ind: { sfm: 500, hex: 0.005 },  drill: { sfm: 180, sfmHss: 45, fd: 0.7 },  tap: { sfm: 15, form: true },  ream: { sfm: 90, kr: 0.014 } },
    ci:     { name: 'Gray cast iron',             hp: 0.6, em: { sfm: 450, k: 0.0042 },  ind: { sfm: 700, hex: 0.007 },  drill: { sfm: 300, sfmHss: 80, fd: 1.1 },  tap: { sfm: 40, form: false }, ream: { sfm: 150, kr: 0.022 } },
    al6061: { name: '6061 aluminum',              hp: 0.3, em: { sfm: 1200, k: 0.007 }, ind: { sfm: 2500, hex: 0.006 }, drill: { sfm: 600, sfmHss: 250, fd: 1.4 }, tap: { sfm: 60, form: true },  ream: { sfm: 300, kr: 0.025 } },
    brass:  { name: 'Brass / bronze',             hp: 0.5, em: { sfm: 900, k: 0.006 },  ind: { sfm: 1200, hex: 0.006 }, drill: { sfm: 400, sfmHss: 150, fd: 1.1 }, tap: { sfm: 80, form: false }, ream: { sfm: 250, kr: 0.022 } },
    ti64:   { name: 'Ti-6Al-4V titanium',         hp: 1.2, em: { sfm: 200, k: 0.003 },  ind: { sfm: 200, hex: 0.004 },  drill: { sfm: 120, sfmHss: 30, fd: 0.6 },  tap: { sfm: 10, form: false }, ream: { sfm: 60, kr: 0.012 } },
  };
  // Coatings: surface speed factors against the coating these numbers assume (AlTiN in steels, stainless, cast iron
  // and titanium; ZrN or polished uncoated in aluminium and brass). Material groups: st steel, ss stainless, ci cast
  // iron, al aluminium and brass, ti titanium.
  const GROUP = { a36: 'st', s1045: 'st', s4140: 'st', tool: 'st', ss304: 'ss', ci: 'ci', al6061: 'al', brass: 'al', ti64: 'ti' };
  // name: shown in the list; full: what it is and its colour; aka: names tool makers sell it under
  const COATINGS = {
    auto:    { name: 'Best for the material', full: 'The numbers\' baseline: AlTiN in steels, stainless, cast iron and titanium; ZrN or polished uncoated in aluminium and brass', aka: '',
               f: { st: 1, ss: 1, ci: 1, al: 1, ti: 1 } },
    none:    { name: 'Uncoated: bare carbide (bright)', full: 'Bare polished carbide', aka: 'bright, polished, uncoated',
               f: { st: 0.75, ss: 0.7, ci: 0.8, al: 1, ti: 0.75 } },
    tin:     { name: 'TiN: titanium nitride (gold)', full: 'Titanium nitride, gold', aka: 'Balinit A, "gold" coating',
               f: { st: 0.8, ss: 0.8, ci: 0.85, al: 0.95, ti: 0.8 } },
    ticn:    { name: 'TiCN: titanium carbonitride (blue-grey)', full: 'Titanium carbonitride, blue-grey to violet', aka: 'Balinit B',
               f: { st: 0.9, ss: 0.85, ci: 0.95, al: 0.95, ti: 0.85 } },
    tialn:   { name: 'TiAlN: titanium aluminum nitride (violet-grey)', full: 'Titanium aluminium nitride, violet-grey', aka: 'Balinit Futura Nano',
               f: { st: 0.95, ss: 0.95, ci: 1, al: 0.8, ti: 0.95 } },
    altin:   { name: 'AlTiN: aluminum titanium nitride (black)', full: 'Aluminium titanium nitride (more aluminium than TiAlN, for more heat), black', aka: 'Balinit X.CEED, "AlTiN Nano", black coating',
               f: { st: 1, ss: 1, ci: 1, al: 0.8, ti: 1 } },
    alcrn:   { name: 'AlCrN: aluminum chromium nitride (blue-grey)', full: 'Aluminium chromium nitride, blue-grey', aka: 'Balinit Alcrona Pro',
               f: { st: 1.05, ss: 1.05, ci: 1, al: 0.8, ti: 1.05 } },
    zrn:     { name: 'ZrN: zirconium nitride (pale gold)', full: 'Zirconium nitride, pale gold', aka: '',
               f: { st: 0.8, ss: 0.75, ci: 0.8, al: 1.1, ti: 0.8 } },
    tib2:    { name: 'TiB2: titanium diboride (silver)', full: 'Titanium diboride, silver-grey; slick, for aluminium and magnesium', aka: '',
               f: { st: 0.75, ss: 0.7, ci: 0.8, al: 1.15, ti: 0.75 } },
    dlc:     { name: 'DLC: diamond-like carbon (dark grey)', full: 'Diamond-like carbon, dark grey to black; for aluminium, brass, plastics', aka: 'Balinit C (WC/C), amorphous diamond, ta-C',
               f: { st: 0.6, ss: 0.6, ci: 0.6, al: 1.2, ti: 0.7 } },
    diamond: { name: 'CVD diamond: diamond grown on the carbide (matte grey)', full: 'Polycrystalline diamond grown on the carbide (CVD); for aluminium, graphite, composites', aka: 'Balinit Diamant, CVD diamond',
               f: { st: 0.5, ss: 0.5, ci: 0.5, al: 1.35, ti: 0.5 } },
  };
  const TOOLS = { endmill: 'End mill', ball: 'Ball end mill', taper: 'Tapered end mill', helix: 'Helix / bore', feedmill: 'High-feed mill', facemill: 'Face mill', chamfer: 'Chamfer mill', drill: 'Drill', tap: 'Tap', reamer: 'Reamer' };
  // end mill operations: radial and axial engagement (fractions of D, aluminium in brackets), speed and chip factors
  const OPS = {
    hem:     { name: 'HEM (light stepover, full flute)', ae: 0.10, aeAl: 0.15, ap: 2.0, sfm: 1.0, k: 1.0 },
    profile: { name: 'Profile / side milling',          ae: 0.30, aeAl: 0.40, ap: 1.0, sfm: 0.85, k: 0.9 },
    slot:    { name: 'Slotting (full width)',           ae: 1.00, aeAl: 1.00, ap: 0.5, apAl: 1.0, sfm: 0.7, k: 0.75 },
    finish:  { name: 'Finish wall (and spring pass)',   ae: 0, aeAl: 0, ap: 2.0, sfm: 1.13, k: 0.35 },
  };

  // ---------------------------------------------------------------- threads and drills
  const UNC = [['#2-56', 0.086, 56], ['#4-40', 0.112, 40], ['#6-32', 0.138, 32], ['#8-32', 0.164, 32], ['#10-24', 0.19, 24], ['#12-24', 0.216, 24],
    ['1/4-20', 0.25, 20], ['5/16-18', 0.3125, 18], ['3/8-16', 0.375, 16], ['7/16-14', 0.4375, 14], ['1/2-13', 0.5, 13], ['9/16-12', 0.5625, 12],
    ['5/8-11', 0.625, 11], ['3/4-10', 0.75, 10], ['7/8-9', 0.875, 9], ['1-8', 1, 8], ['1 1/8-7', 1.125, 7], ['1 1/4-7', 1.25, 7], ['1 1/2-6', 1.5, 6]];
  const UNF = [['#4-48', 0.112, 48], ['#6-40', 0.138, 40], ['#8-36', 0.164, 36], ['#10-32', 0.19, 32], ['1/4-28', 0.25, 28], ['5/16-24', 0.3125, 24],
    ['3/8-24', 0.375, 24], ['7/16-20', 0.4375, 20], ['1/2-20', 0.5, 20], ['9/16-18', 0.5625, 18], ['5/8-18', 0.625, 18], ['3/4-16', 0.75, 16],
    ['7/8-14', 0.875, 14], ['1-12', 1, 12], ['1-14', 1, 14]];
  const MET = [['M3x0.5', 3, 0.5], ['M4x0.7', 4, 0.7], ['M5x0.8', 5, 0.8], ['M6x1', 6, 1], ['M8x1.25', 8, 1.25], ['M8x1', 8, 1], ['M10x1.5', 10, 1.5],
    ['M10x1.25', 10, 1.25], ['M12x1.75', 12, 1.75], ['M12x1.25', 12, 1.25], ['M14x2', 14, 2], ['M16x2', 16, 2], ['M16x1.5', 16, 1.5], ['M20x2.5', 20, 2.5], ['M24x3', 24, 3]];
  // name -> {major (in), pitch (in), tpi}
  const THREADS = {};
  for (const [n, d, t] of UNC.concat(UNF)) THREADS[n] = { name: n, major: d, pitch: 1 / t, tpi: t, metric: false };
  for (const [n, d, p] of MET) THREADS[n] = { name: n, major: d / 25.4, pitch: p / 25.4, tpi: 25.4 / p, metric: true, mm: d, pmm: p };
  function thread(name) {
    if (THREADS[name]) return THREADS[name];
    const s = String(name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    let m = /^M\s*([\d.]+)\s*[X×]\s*([\d.]+)$/.exec(s);
    if (m) return { name: 'M' + m[1] + 'x' + m[2], major: m[1] / 25.4, pitch: m[2] / 25.4, tpi: 25.4 / m[2], metric: true, mm: +m[1], pmm: +m[2] };
    m = /^([\d./ #]+)-(\d+)$/.exec(s);
    if (m) {
      let d = m[1].trim();
      const nb = /^#(\d+)$/.exec(d);
      if (nb) d = 0.06 + 0.013 * +nb[1];
      else { const f = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(d); d = f ? (+(f[1] || 0) + f[2] / f[3]) : parseFloat(d); }
      if (d > 0) return { name: s, major: d, pitch: 1 / m[2], tpi: +m[2], metric: false };
    }
    return null;
  }
  // standard drills: fractions to 1-1/2 by 64ths, number drills #1-#60, letters A-Z, metric 1-20 mm by 0.1 to 10, 0.5 above
  const DRILLS = [];
  const NUMBER = [0.228, 0.221, 0.213, 0.209, 0.2055, 0.204, 0.201, 0.199, 0.196, 0.1935, 0.191, 0.189, 0.185, 0.182, 0.18, 0.177, 0.173, 0.1695, 0.166, 0.161,
    0.159, 0.157, 0.154, 0.152, 0.1495, 0.147, 0.144, 0.1405, 0.136, 0.1285, 0.12, 0.116, 0.113, 0.111, 0.11, 0.1065, 0.104, 0.1015, 0.0995, 0.098,
    0.096, 0.0935, 0.089, 0.086, 0.082, 0.081, 0.0785, 0.076, 0.073, 0.07, 0.067, 0.0635, 0.0595, 0.055, 0.052, 0.0465, 0.043, 0.042, 0.041, 0.04];
  NUMBER.forEach((d, i) => DRILLS.push({ name: '#' + (i + 1), d }));
  const LETTER = [0.234, 0.238, 0.242, 0.246, 0.25, 0.257, 0.261, 0.266, 0.272, 0.277, 0.281, 0.29, 0.295, 0.302, 0.316, 0.323, 0.332, 0.339, 0.348, 0.358,
    0.368, 0.377, 0.386, 0.397, 0.404, 0.413];
  LETTER.forEach((d, i) => DRILLS.push({ name: String.fromCharCode(65 + i), d }));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  for (let k = 1; k <= 96; k++) { const g = gcd(k, 64), w = Math.floor(k / 64), r = k % 64; DRILLS.push({ name: (w ? w + (r ? ' ' : '') : '') + (r ? (r / gcd(r, 64)) + '/' + (64 / gcd(r, 64)) : ''), d: k / 64 }); void g; }
  for (let mm = 1; mm <= 20.001; mm += mm < 10 ? 0.1 : 0.5) DRILLS.push({ name: (+mm.toFixed(1)) + ' mm', d: +(mm / 25.4).toFixed(5), metric: true });
  DRILLS.sort((a, b) => a.d - b.d);
  // the standard drills nearest to d, below and above
  function nearDrills(d, metric) {
    const list = DRILLS.filter(x => (metric === undefined ? true : !!x.metric === metric));
    let lo = null, hi = null;
    for (const x of list) { if (x.d <= d + 1e-6) lo = x; else if (!hi) hi = x; }
    return { lo, hi };
  }
  // % of thread from the hole: UN/ISO 60° threads, full thread depth 0.6495 × pitch on the diameter (cut) or
  // 0.3248 for forming (the metal flows up, so the hole is larger)
  const threadPct = (t, hole, form) => ((t.major - hole) / ((form ? 0.68 : 1.299) * t.pitch)) * 100;
  const holeFor = (t, pct, form) => t.major - (form ? 0.68 : 1.299) * t.pitch * pct / 100;

  // ---------------------------------------------------------------- the calculation
  // radial chip thinning: below half the diameter the chip is thinner than the feed per tooth
  const rctf = (D, ae) => (ae > 0 && ae < D / 2 ? D / (2 * Math.sqrt(D * ae - ae * ae)) : 1);
  const DEFAULTS = {
    tool: 'endmill', mat: 'a36', toolMat: 'carbide', D: '0.5', Z: '4', op: 'hem', ae: '', ap: '', loc: '1.25', stick: '1.5',
    bore: '1', pre: '', hmode: 'helix', ramp: '', finish: false, angle: '45', maxap: '0.3', coating: 'auto', taper: '3', tip: 'square', tipR: '',
    thin: true, lead: '', insertZ: '', thread: '1/4-20', tapType: 'cut', pct: '', depth: '', point: '135',
    sfm: '', fz: '', rpm: '', feed: '',
    maxRpm: '12000', hp: '25', maxFeed: '1000', tapRpm: '2000', eff: '80',
  };
  function calc(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const M = MATERIALS[c.mat] || MATERIALS.a36, tool = TOOLS[c.tool] ? c.tool : 'endmill';
    const W = [], how = [];
    const machine = { maxRpm: Math.max(1, num(c.maxRpm, 12000)), hp: Math.max(0.1, num(c.hp, 25)), maxFeed: Math.max(1, num(c.maxFeed, 1000)),
      tapRpm: Math.max(1, num(c.tapRpm, 2000)), eff: Math.min(1, Math.max(0.3, num(c.eff, 80) / 100)) };
    let D = Math.max(0.001, Math.abs(num(c.D, 0.5)));
    const r = { tool, toolName: TOOLS[tool], mat: c.mat, matName: M.name, D, machine, warnings: W, how };
    const hss = c.toolMat === 'hss' || c.toolMat === 'cobalt';
    // coating: a surface speed factor for solid tools (inserts carry their own grade)
    const group = GROUP[c.mat] || 'st', coating = COATINGS[c.coating] ? c.coating : 'auto';
    const solid = !(tool === 'feedmill' || tool === 'facemill' || tool === 'chamfer');
    const cf = solid ? COATINGS[coating].f[group] : 1;
    r.coating = solid ? coating : null; r.coatF = cf;
    if (solid && cf !== 1) how.push(COATINGS[coating].name + ' coating in ' + M.name + ': surface speed × ' + cf);
    if (solid && (coating === 'altin' || coating === 'tialn' || coating === 'alcrn') && group === 'al') W.push('Aluminium sticks to aluminium-based coatings (' + COATINGS[coating].name + '): use ZrN, TiB2, DLC, diamond or polished uncoated.');
    if (solid && (coating === 'dlc' || coating === 'diamond') && group !== 'al') W.push(COATINGS[coating].name + ' is for aluminium, brass and plastics: in ' + M.name + ' the heat breaks it down. Use AlTiN or AlCrN.');
    if (solid && coating !== 'auto') r.coatText = COATINGS[coating].full + (COATINGS[coating].aka ? ' · also sold as ' + COATINGS[coating].aka : '');
    if (solid && coating === 'tin' && !hss) W.push('TiN is an HSS-era coating; on carbide in ' + M.name + ' AlTiN or AlCrN run faster and last longer.');
    // spindle speed from surface speed at diameter d, capped at the machine (or the override)
    const speed = (sfmWant, d, cap, label) => {
      const want = sfmWant * SFM_RPM / d, over = num(c.rpm, 0);
      let rpm = over > 0 ? over : Math.min(want, cap);
      rpm = Math.round(rpm);
      if (!(over > 0) && want > cap) W.push((label || 'The speed') + ' wants ' + Math.round(want) + ' RPM; the ' + (cap === machine.tapRpm ? 'tapping limit' : 'spindle') + ' tops out at ' + Math.round(cap) + ', so it runs at ' + Math.round(rpm * d / SFM_RPM) + ' SFM.');
      return { rpm, want: Math.round(want), sfm: rpm * d / SFM_RPM };
    };
    const feedCap = (f, over) => {
      const o = num(over, 0);
      if (o > 0) return o;
      if (f > machine.maxFeed) { W.push('Feed ' + f.toFixed(1) + ' in/min is over the machine\'s ' + machine.maxFeed + '; capped.'); return machine.maxFeed; }
      return f;
    };
    const power = (mrr, rpm, sfm) => {
      const hpCut = mrr * M.hp, hpSp = hpCut / machine.eff;
      r.mrr = mrr; r.hpCut = hpCut; r.hp = hpSp; r.hpPct = hpSp / machine.hp * 100;
      r.torque = rpm > 0 ? hpCut * 5252 / rpm : 0;                  // ft·lb at the cutter
      r.force = sfm > 0 ? hpCut * 33000 / sfm : 0;                    // lbf, tangential
      if (r.hpPct > 80) W.push('Spindle power ' + hpSp.toFixed(1) + ' hp is ' + Math.round(r.hpPct) + '% of the machine\'s ' + machine.hp + ' hp. Take less, or check the spindle\'s power at ' + rpm + ' RPM (it is lower at low speed).');
    };

    if (tool === 'endmill' || tool === 'ball' || tool === 'taper') {
      const Z = Math.max(1, Math.round(num(c.Z, 4))), op = OPS[c.op] || OPS.hem, al = c.mat === 'al6061' || c.mat === 'brass';
      const loc = Math.max(0.01, num(c.loc, 2.5 * D)), stick = Math.max(0.01, num(c.stick, loc + 0.25));
      let ap = num(c.ap, 0) > 0 ? num(c.ap, 0) : Math.min(loc, D * (al && op.apAl ? op.apAl : op.ap));
      // a tapered tool is sized by its diameter halfway up the cut (stepover, chip, reach)
      const ta = Math.tan(Math.min(30, Math.max(0, num(c.taper, 3))) * PI / 180), Dr = tool === 'taper' ? D + ap * ta : D;
      // HEM: the deeper (and so the longer the reach), the lighter the stepover: 15% of D at 1×D deep, 7% past 3×D
      const hemAe = Math.min(0.15, Math.max(0.06, 0.15 - 0.035 * (ap / Dr - 1))) + (al ? 0.05 : 0);
      let ae = num(c.ae, 0) > 0 ? num(c.ae, 0) : c.op === 'finish' ? Math.min(0.012, Dr * 0.03) : c.op === 'hem' || !(c.op in OPS) ? Dr * hemAe : Dr * (al ? op.aeAl : op.ae);
      if (tool === 'ball') { if (!(num(c.ap, 0) > 0)) ap = Math.min(ap, D * 0.1); if (!(num(c.ae, 0) > 0)) ae = Math.min(ae, D * 0.1); }
      ae = Math.min(ae, Dr);
      // a ball cuts at a smaller diameter at shallow depth; a tapered tool is widest at the top of the cut
      const tipR = tool === 'taper' && c.tip === 'ball' ? Math.min(D / 2, num(c.tipR, 0) > 0 ? num(c.tipR, 0) : D / 2) : 0;
      let Deff = tool === 'ball' && ap < D / 2 ? 2 * Math.sqrt(ap * (D - ap)) : D;
      if (tool === 'taper') {
        Deff = tipR && ap < tipR * (1 - Math.sin(Math.atan(ta))) ? 2 * Math.sqrt(ap * (2 * tipR - ap)) : D + 2 * Math.max(0, ap - tipR) * ta;
        r.Dtop = Deff; r.Dmid = D + Math.max(0, ap - tipR) * ta; r.taper = Math.atan(ta) * 180 / PI; r.tipR = tipR;
      }
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.em.sfm * op.sfm * (hss ? 0.3 : 1) * cf;
      const S = speed(sfmBase, Deff, machine.maxRpm, 'The surface speed');
      const actual = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.em.k * Dr * op.k * (hss ? 0.8 : 1);
      const thin = c.thin ? rctf(tool === 'taper' ? r.Dmid : D, ae) * (tool === 'ball' ? D / Deff : 1) : 1;
      const fzProg = actual * thin;
      const feed = feedCap(S.rpm * Z * fzProg, c.feed);
      Object.assign(r, { Z, op: c.op in OPS ? c.op : 'hem', ae, ap, loc, stick, Deff, sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, fzActual: feed / (S.rpm * Z) / thin, fzProg: feed / (S.rpm * Z), thin, feed, ipr: feed / S.rpm });
      power(ae * ap * feed, S.rpm, S.sfm);
      // bending of the tool: a cantilever of the fluted core (about 0.8 D) under the tangential force
      // a taper's core grows along the flutes: take the section halfway up the stick-out
      const Dcore = tool === 'taper' ? D + stick * ta : D;
      const E = hss ? 30e6 : 90e6, I = PI * Math.pow(0.8 * Dcore, 4) / 64;
      r.deflection = r.force * Math.pow(Math.max(stick - ap / 2, 0.01), 3) / (3 * E * I);      // force at mid-depth of the cut
      if (tool === 'taper') {
        how.push('Tapered ' + r.taper.toFixed(1) + '° per side from Ø' + D + (tipR ? ' (ball tip R' + tipR.toFixed(4) + ')' : '') + ': Ø' + Deff.toFixed(4) + ' at the top of the cut, so the RPM comes from there to keep the surface speed');
        if (Deff > D * 1.8) W.push('The cut is ' + (Deff / D).toFixed(1) + '× the tip diameter at the top: the tip runs at only ' + Math.round(S.sfm * D / Deff) + ' SFM. Fine for finishing walls; for roughing, a straight tool is faster.');
      }
      how.push('RPM = SFM × 3.82 ÷ ' + (tool === 'ball' && Deff < D ? 'effective D ' + Deff.toFixed(4) : 'D') + ' = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + Deff.toFixed(4) + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      if (thin > 1.0001) how.push('Chip thinning at ' + ae.toFixed(4) + ' stepover' + (tool === 'ball' && Deff < D ? ' and ' + ap.toFixed(4) + ' depth' : '') + ': × ' + thin.toFixed(2) + ', so ' + actual.toFixed(4) + ' real chip is programmed as ' + fzProg.toFixed(4) + ' per tooth');
      how.push('Feed = RPM × flutes × chip = ' + S.rpm + ' × ' + Z + ' × ' + (feed / (S.rpm * Z)).toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min');
      how.push('Removal = stepover × depth × feed = ' + ae.toFixed(4) + ' × ' + ap.toFixed(4) + ' × ' + feed.toFixed(1) + ' = ' + r.mrr.toFixed(2) + ' in³/min');
      if (ap > loc + 1e-9) W.push('Depth ' + ap.toFixed(3) + ' is deeper than the flutes (' + loc + ').');
      if (stick > 4 * (tool === 'taper' ? D + stick * ta : D)) W.push('Stick-out ' + stick + ' is over 4× the diameter; drop the chip load or the stepover, or use a shorter holder.');
      if (r.deflection > 0.001) W.push('The tool bends about ' + r.deflection.toFixed(4) + ' in under this cut. Over 0.001 hurts finish and tool life: shorten the stick-out or lighten the cut.');
      if (c.op === 'hem' && ae > 0.2 * Dr) W.push('A stepover of ' + (ae / Dr * 100).toFixed(0) + '% of D is heavy for HEM (usually 5–15%, up to 20% in aluminium).');
      if (c.op === 'slot' && ap > (al ? 1 : 0.5) * D + 1e-9) W.push('Slotting deeper than ' + (al ? '1×' : '0.5×') + ' D in this material is hard on the tool; take it in levels or use HEM (trochoidal).');
      if (thin > 3 && c.op !== 'finish') W.push('Chip thinning raises the feed ' + thin.toFixed(1) + '× at this light stepover; check ' + r.fzProg.toFixed(4) + ' per tooth against the tool maker\'s maximum.');
      if (c.op === 'finish') {
        how.push('Finish: ' + ae.toFixed(4) + ' stock on the wall at full depth, ' + Math.round(op.sfm * 100 - 100) + '% faster surface speed and a light chip. Spring pass: the same path again with no offset change, at the same speed and feed, to take off what the tool sprang away from.');
        if (ae > 0.02) W.push('Finish stock ' + ae.toFixed(3) + ' is heavy for a finish pass at ' + (ap / D).toFixed(1) + '× D deep; 0.010–0.015 per side (0.006–0.008 if the wall comes out tapered).');
      }
      if (ap > 2.5 * Dr && c.op !== 'finish') W.push('Chatter at ' + (ap / Dr).toFixed(1) + '× D deep: first drop the stepover to about 5% of D (0.035–0.040 on a 3/4 tool) keeping the chip load, then try 10–15% more or less RPM, and if it still sings take the depth in two levels. Use a shrink-fit or hydraulic holder with the least stick-out.');
    } else if (tool === 'helix') {
      // helical interpolation into a hole (or circular interpolation at full depth from a pre-drilled hole)
      const Z = Math.max(1, Math.round(num(c.Z, 4))), al = c.mat === 'al6061' || c.mat === 'brass';
      const Dh = Math.max(0.001, num(c.bore, 1)), depth = Math.max(0, num(c.depth, D)), pre = Math.max(0, num(c.pre, 0));
      const loc = Math.max(0.01, num(c.loc, 2.5 * D)), stick = Math.max(0.01, num(c.stick, loc + 0.25));
      const Dc = Dh - D, circle = c.hmode === 'circle', fin = !!c.finish, solid = !(pre > 0);
      r.bore = Dh; r.Dc = Dc; r.pre = pre; r.depth = depth; r.hmode = circle ? 'circle' : 'helix'; r.Z = Z; r.loc = loc; r.stick = stick;
      if (Dc <= 0) { W.push('The tool (' + D + ') is as big as the hole (' + Dh + '): use a smaller tool or drill it.'); Object.assign(r, { rpm: 0, feed: 0, sfm: 0, ipr: 0 }); return r; }
      if (circle && solid) W.push('Circular interpolation at full depth needs a pre-drilled or roughed hole; enter its diameter (or use Helix down).');
      // radial cut: into solid the tool takes the whole hole; from a pre-hole, the stock on the side. Round an inside
      // arc the tool is wrapped in more of the cut than a straight wall at the same stock.
      const stock = solid ? Math.min(D, Dh / 2) : Math.max(0, (Dh - pre) / 2);
      const aeEff = Math.min(D, solid ? D : stock * (Dh - stock) / Dc);
      const heavy = aeEff >= D * 0.5;
      const sf = fin ? 1.13 : heavy ? 0.78 : 1, kf = fin ? 0.35 : heavy ? 0.8 : 1;
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.em.sfm * sf * (hss ? 0.3 : 1) * cf;
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const actual = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.em.k * D * kf * (hss ? 0.8 : 1);
      const thin = c.thin ? rctf(D, aeEff) : 1;
      const edge = S.rpm * Z * actual * thin;                        // feed at the cutting edge
      const center = feedCap(edge * Dc / Dh, c.feed);                // what the program feeds: the tool centre
      const ramp = Math.min(10, Math.max(0.2, num(c.ramp, 0) > 0 ? num(c.ramp, 0) : al ? 3 : c.mat === 'ss304' || c.mat === 'ti64' || c.mat === 'tool' ? 1 : 1.5));
      const pitch = circle ? 0 : Math.min(PI * Dc * Math.tan(ramp * PI / 180), D * 0.1);
      const revs = circle ? 1 : pitch > 0 ? depth / pitch : 0;
      const lap = PI * Dc, minutes = (revs + 1) * lap / Math.max(center, 1e-6);
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, feed: center, ipr: center / S.rpm, edgeFeed: center * Dh / Dc, edgeIpr: center * Dh / Dc / S.rpm,
        fzProg: center * Dh / Dc / (S.rpm * Z), fzActual: center * Dh / Dc / (S.rpm * Z) / thin, thin, ae: stock, aeEff, ap: circle ? depth : pitch, pitch, ramp: circle ? 0 : Math.atan(pitch / lap) * 180 / PI, revs, minutes, finish: fin });
      const vol = PI / 4 * (Dh * Dh - pre * pre) * depth;
      power(minutes > 0 ? vol / minutes : 0, S.rpm, S.sfm);
      const E = hss ? 30e6 : 90e6, I = PI * Math.pow(0.8 * D, 4) / 64;
      r.deflection = r.force * Math.pow(Math.max(stick - (circle ? depth / 2 : 0), 0.01), 3) / (3 * E * I);
      how.push('Tool centre path Ø = hole − tool = ' + Dh + ' − ' + D + ' = ' + Dc.toFixed(4));
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : '') + (heavy && !fin ? ' (slower: the tool is ' + (solid ? 'in solid, nearly full width' : 'deep in the cut') + ')' : ''));
      how.push('Feed at the cutting edge = RPM × flutes × chip = ' + S.rpm + ' × ' + Z + ' × ' + r.fzProg.toFixed(4) + ' = ' + r.edgeFeed.toFixed(1) + ' in/min' + (thin > 1.0001 ? ' (chip thinning × ' + thin.toFixed(2) + ' on ' + aeEff.toFixed(4) + ' effective stepover)' : ''));
      how.push('Programmed feed (tool centre) = edge feed × path Ø ÷ hole Ø = ' + r.edgeFeed.toFixed(1) + ' × ' + Dc.toFixed(4) + ' ÷ ' + Dh + ' = ' + center.toFixed(1) + ' in/min = ' + r.ipr.toFixed(4) + ' in/rev. Program this unless the control corrects arc feeds itself (then program the edge feed).');
      if (!circle) how.push('Step down per turn = π × path Ø × tan(ramp ' + ramp + '°) = ' + pitch.toFixed(4) + '; ' + revs.toFixed(0) + ' turns to ' + depth + ' deep, plus a flat turn at the bottom, about ' + (minutes).toFixed(1) + ' min');
      else how.push('One turn at full depth ' + depth + ', ' + (lap / center).toFixed(2) + ' min' + (fin ? '; spring pass: the same turn again at the same speed and feed' : ''));
      if (solid && Dh > 2 * D) W.push('The hole is more than twice the tool: helixing into solid leaves a core Ø' + (Dh - 2 * D).toFixed(3) + ' in the middle. Drill it first, or step out in rings.');
      if (solid && !circle) W.push('Into solid the tool cuts on its end: it must be centre-cutting. At ' + (depth / Dh).toFixed(1) + '× the hole deep chips pack: blow or flood them out, or drill first (' + (Dh - D * 0.3).toFixed(3) + ' or so) and circular-interpolate to size, which is usually quicker.');
      if ((circle ? depth : 0) > loc + 1e-9) W.push('Depth ' + depth + ' is deeper than the flutes (' + loc + ').');
      if (r.deflection > 0.001) W.push('The tool bends about ' + r.deflection.toFixed(4) + ' in: expect a tapered bore. Leave 0.006–0.008 per side for the finish, and take a spring pass.');
    } else if (tool === 'chamfer') {
      // indexable chamfer mill: D is the smallest diameter, the edge at `angle` from the axis, up to maxap deep
      const Z = Math.max(1, Math.round(num(c.Z, 3))), alpha = Math.min(80, Math.max(5, num(c.angle, 45))), maxap = Math.max(0.01, num(c.maxap, 0.3));
      const ap = num(c.ap, 0) > 0 ? num(c.ap, 0) : Math.min(maxap * 0.8, 0.25), ta = Math.tan(alpha * PI / 180);
      const chamferW = ap * ta, ae = num(c.ae, 0) > 0 ? num(c.ae, 0) : chamferW;
      const Davg = D + ap * ta, Dmax = D + 2 * ap * ta, kappa = 90 - alpha;
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.ind.sfm;
      const S = speed(sfmBase, Davg, machine.maxRpm, 'The surface speed');
      // the more of the edge in the cut, the lighter the chip
      const use = ap / maxap, fe = use <= 0.5 ? 0.85 : Math.max(0.6, 0.85 - 0.4 * (use - 0.5));
      const hex = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.ind.hex * fe;
      const thin = 1 / Math.sin(kappa * PI / 180);
      const feed = feedCap(S.rpm * Z * hex * thin, c.feed);
      Object.assign(r, { Z, alpha, maxap, ap, ae, Davg, Dmax, lead: kappa, sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, feed, ipr: feed / S.rpm, fzProg: feed / (S.rpm * Z), fzActual: feed / (S.rpm * Z) / thin, thin, shoulder: num(c.ae, 0) > chamferW + 1e-9 });
      power((r.shoulder ? ae * ap : ap * chamferW / 2) * feed, S.rpm, S.sfm);
      how.push('Diameter in the cut: ' + D + ' at the tip to ' + Dmax.toFixed(4) + ' at ' + ap + ' deep (edge ' + alpha + '° from the axis); RPM from the middle, ' + Davg.toFixed(4) + ': ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + Davg.toFixed(4) + ' = ' + S.want);
      how.push('Chip ' + hex.toFixed(4) + (fe < 0.85 ? ' (lighter: ' + Math.round(use * 100) + '% of the edge is in the cut)' : '') + ' ÷ sin(' + kappa + '°) = ' + r.fzProg.toFixed(4) + ' per tooth; feed = ' + S.rpm + ' × ' + Z + ' × ' + r.fzProg.toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min (' + r.ipr.toFixed(4) + ' in/rev)');
      if (ap > maxap + 1e-9) W.push('Depth ' + ap + ' is past the insert edge (' + maxap + ').');
      if (r.shoulder && use > 0.6) W.push('An angled shoulder with ' + Math.round(use * 100) + '% of the edge in the cut is loud (chatter): rough the bulk with an end mill leaving about 0.030 on the wall, or step down 0.150–0.200 instead; climb mill, keep the feed up (slowing makes it rub), and try 10–15% more or less RPM.');
      else if (r.shoulder && ae > 0.15) W.push('Wide shoulder cuts with a chamfer mill chatter easily: keep the width to 0.100–0.150 at a time.');
      how.push('For roughing, about 80% of the edge (' + (maxap * 0.8).toFixed(3) + ') leaves margin on the insert; the full edge (' + maxap + ') works but at a lighter chip.');
    } else if (tool === 'feedmill' || tool === 'facemill') {
      const Z = Math.max(1, Math.round(num(c.Z, tool === 'feedmill' ? 4 : 5)));
      const lead = Math.min(90, Math.max(5, num(c.lead, tool === 'feedmill' ? 15 : 45)));
      const ae = Math.min(D, num(c.ae, 0) > 0 ? num(c.ae, 0) : D * (tool === 'feedmill' ? 0.65 : 0.7));
      const ap = num(c.ap, 0) > 0 ? num(c.ap, 0) : tool === 'feedmill' ? Math.min(0.06, D * 0.04) : Math.min(0.1, D * 0.05);
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.ind.sfm * (tool === 'feedmill' ? 0.9 : 1);
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const hex = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.ind.hex;
      // the chip is thinner by sin(lead angle); a light radial cut thins it further
      const axial = 1 / Math.sin(lead * PI / 180), radial = c.thin ? rctf(D, ae) : 1, thin = axial * radial;
      const feed = feedCap(S.rpm * Z * hex * thin, c.feed);
      Object.assign(r, { Z, lead, ae, ap, sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, fzActual: feed / (S.rpm * Z) / thin, fzProg: feed / (S.rpm * Z), thin, feed, ipr: feed / S.rpm });
      power(ae * ap * feed, S.rpm, S.sfm);
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Lead angle ' + lead + '°: the chip is thinner by sin ' + lead + '° = ' + Math.sin(lead * PI / 180).toFixed(3) + ', so ' + hex.toFixed(4) + ' chip is ' + (hex * axial).toFixed(4) + ' per tooth' + (radial > 1.0001 ? ', × ' + radial.toFixed(2) + ' for the light radial cut = ' + (hex * thin).toFixed(4) : ''));
      how.push('Feed = RPM × inserts × feed per tooth = ' + S.rpm + ' × ' + Z + ' × ' + r.fzProg.toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min');
      how.push('Removal = width × depth × feed = ' + ae.toFixed(3) + ' × ' + ap.toFixed(3) + ' × ' + feed.toFixed(1) + ' = ' + r.mrr.toFixed(2) + ' in³/min');
      if (tool === 'feedmill' && ap > D * 0.08) W.push('High-feed mills take shallow cuts; ' + ap.toFixed(3) + ' deep is more than most allow (check the insert\'s maximum, often 0.04–0.08).');
      if (tool === 'facemill' && ae > 0.8 * D) W.push('A face mill cutting ' + Math.round(ae / D * 100) + '% of its width: 60–75% is kinder to the inserts (enter and leave the cut thin).');
    } else if (tool === 'drill') {
      const carb = !hss, depth = Math.max(0, num(c.depth, 3 * D)), point = Math.min(180, Math.max(60, num(c.point, carb ? 135 : 118)));
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : (carb ? M.drill.sfm : M.drill.sfmHss * (c.toolMat === 'cobalt' ? 1.15 : 1)) * cf;
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const base = carb ? 0.0015 + 0.015 * D : 0.001 + 0.012 * D;
      const ipr = num(c.fz, 0) > 0 ? num(c.fz, 0) : Math.min(0.03, Math.max(0.0005, base * M.drill.fd));
      const feed = feedCap(S.rpm * ipr, c.feed);
      const ratio = depth / D, tip = D / 2 / Math.tan(point / 2 * PI / 180);
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, ipr: feed / S.rpm, fzProg: feed / S.rpm / 2, feed, depth, point, tip, ratio });
      power(PI * D * D / 4 * feed, S.rpm, S.sfm);
      r.peck = ratio <= (carb ? 5 : 3) ? 0 : ratio <= 8 ? D : D * 0.5;
      r.cycle = r.peck ? (carb ? 'G83 peck ' : 'G83 peck ') + r.peck.toFixed(3) : carb ? 'G81 (no peck)' : ratio > 2 ? 'G73 chip break' : 'G81';
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Feed per rev = (' + (carb ? '0.0015 + 0.015' : '0.001 + 0.012') + ' × D) × ' + M.drill.fd + ' for the material = ' + ipr.toFixed(4) + '; feed = ' + S.rpm + ' × ' + ipr.toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min');
      how.push('Point ' + point + '° adds ' + tip.toFixed(4) + ' to the depth for the full diameter; hole ' + ratio.toFixed(1) + '× D deep');
      if (carb && ratio > 5) W.push('A hole ' + ratio.toFixed(1) + '× D deep: use a through-coolant drill (or a longer series, with a pilot hole) and peck.');
      if (!carb && ratio > 3) W.push('A hole ' + ratio.toFixed(1) + '× D deep with an HSS drill: peck to clear chips.');
    } else if (tool === 'tap') {
      const t = thread(c.thread) || THREADS['1/4-20'], form = c.tapType === 'form';
      D = t.major;
      r.D = D; r.thread = t;
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.tap.sfm * (form ? 1.25 : 1) * (c.toolMat === 'carbide' ? 2 : 1) * cf;
      const S = speed(sfmBase, D, Math.min(machine.tapRpm, machine.maxRpm), 'Tapping');
      const feed = S.rpm * t.pitch;
      const pct = num(c.pct, 0) > 0 ? num(c.pct, 0) : form ? 65 : 75;
      const hole = holeFor(t, pct, form), near = nearDrills(hole, !!t.metric);
      const pick = [near.lo, near.hi].filter(Boolean).map(x => ({ name: x.name, d: x.d, pct: threadPct(t, x.d, form) }));
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, feed, ipr: t.pitch, pitch: t.pitch, tpi: t.tpi, form, pct, hole, drills: pick, depth: num(c.depth, 0) });
      r.mrr = 0; r.hp = r.hpPct = r.torque = 0;
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D.toFixed(4) + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Feed = RPM × pitch = ' + S.rpm + ' × ' + t.pitch.toFixed(5) + ' = ' + feed.toFixed(2) + ' in/min (G84 F' + feed.toFixed(2) + ', or F' + t.pitch.toFixed(5) + ' per rev with G95)');
      how.push('Hole for ' + pct + '% thread (' + (form ? 'form tap: D − 0.68 × pitch × %' : 'cut tap: D − 1.299 × pitch × %') + ') = ' + hole.toFixed(4));
      if (form && !M.tap.form) W.push('Form taps are not advised in ' + M.name + '; use a cut tap.');
      if (!form && pct > 80) W.push(pct + '% thread is hard on cut taps and adds little strength; 65–75% is usual.');
    } else if (tool === 'reamer') {
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.ream.sfm * (hss ? 0.35 : 1) * cf;
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const ipr = num(c.fz, 0) > 0 ? num(c.fz, 0) : Math.min(0.04, M.ream.kr * D + 0.002);
      const feed = feedCap(S.rpm * ipr, c.feed);
      const stock = D <= 0.25 ? 0.008 : D <= 0.5 ? 0.012 : D <= 1 ? 0.016 : 0.025;
      const pre = nearDrills(D - stock, false);
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, ipr: feed / S.rpm, feed, stock, pre: pre.lo ? { name: pre.lo.name, d: pre.lo.d, left: D - pre.lo.d } : null });
      power(PI / 4 * (D * D - Math.pow(D - stock, 2)) * feed, S.rpm, S.sfm);
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Feed = ' + S.rpm + ' × ' + ipr.toFixed(4) + ' per rev = ' + feed.toFixed(1) + ' in/min; leave ' + stock.toFixed(3) + ' on the diameter for the reamer');
    }
    if (typeof r.rpm === 'number') r.rpm = Math.round(r.rpm);
    if (typeof r.feed === 'number') r.feed = +r.feed.toFixed(r.tool === 'tap' ? 3 : 1);
    return r;
  }

  // G-code lines for the result (what to put in the program)
  function gcode(r, cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {}), f = (v, d) => (+v).toFixed(d).replace(/0+$/, '').replace(/\.$/, '.');
    const L = ['S' + r.rpm + ' M3'];
    if (r.tool === 'drill') {
      const z = '-' + f(r.depth + r.tip, 4);
      L.push(r.peck ? 'G98 G83 X_ Y_ Z' + z + ' R0.1 Q' + f(r.peck, 4) + ' F' + f(r.feed, 1) : (r.cycle.indexOf('G73') === 0 ? 'G98 G73 X_ Y_ Z' + z + ' R0.1 Q' + f(Math.max(r.D, 0.05), 4) + ' F' + f(r.feed, 1) : 'G98 G81 X_ Y_ Z' + z + ' R0.1 F' + f(r.feed, 1)));
    } else if (r.tool === 'tap') {
      L[0] = 'S' + r.rpm;
      L.push('M29 S' + r.rpm + ' (rigid tapping, if the machine needs it)');
      L.push('G98 G84 X_ Y_ Z-' + f(Math.max(num(c.depth, 0), 0) || 0.5, 4) + ' R0.2 F' + f(r.feed, 3));
    } else if (r.tool === 'reamer') {
      L.push('G98 G85 X_ Y_ Z-_ R0.1 F' + f(r.feed, 1) + ' (feeds in and out)');
    } else if (r.tool === 'helix' && r.Dc > 0) {
      const R = f(r.Dc / 2, 4), F = f(r.feed, 1);
      L.push('(hole centre at X0 Y0; ' + (r.hmode === 'circle' ? 'one turn at full depth' : 'helix down ' + f(r.pitch, 4) + ' per turn') + '; F is at the tool centre)');
      L.push('G90 G0 X' + R + ' Y0');
      if (r.hmode === 'circle') {
        L.push('G0 Z0.1', 'G1 Z-' + f(r.depth, 4) + ' F' + F + ' (into the pre-drilled hole)', 'G3 X' + R + ' Y0 I-' + R + ' J0 F' + F);
        if (r.finish) L.push('G3 X' + R + ' Y0 I-' + R + ' J0 (spring pass)');
      } else {
        L.push('G0 Z0.05', '#100=0.05', 'WHILE[#100GT-' + f(r.depth, 4) + ']DO1', '#100=#100-' + f(r.pitch, 4), 'IF[#100LT-' + f(r.depth, 4) + ']THEN#100=-' + f(r.depth, 4),
          'G3 X' + R + ' Y0 I-' + R + ' J0 Z#100 F' + F, 'END1', 'G3 X' + R + ' Y0 I-' + R + ' J0 (flat turn at the bottom)');
      }
      L.push('G1 X0 Y0', 'G0 Z1.');
    } else L.push('G1 ... F' + f(r.feed, 1));
    return L;
  }

  const api = { calc, gcode, MATERIALS, COATINGS, GROUP, TOOLS, OPS, THREADS, thread, DRILLS, nearDrills, threadPct, holeFor, rctf, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FEEDS = api;
})(this);

// CAD geometry for MACH1: shapes (points with fillets and arcs, open edges), construction geometry, changing shapes
// (move, rotate, scale, mirror), shapes as text, dimensions, arc fitting and ASCII DXF import. Inch. No Clipper here:
// the toolpath geometry (offsets, clipping) is in hem-geo.js, which hands these out too.
// Polylines are [[x, y], ...]; closed ones do not repeat the first point.
(function (root) {
  'use strict';
  function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  // ---------------------------------------------------------------- shapes: lines, arcs, fillets
  // A shape is {closed, pts: [[x, y, fillet, arc], ...]}. arc is the segment from this point to the next:
  // 0 = straight, otherwise its radius, + counter-clockwise (G3) or − clockwise (G2), the shorter way round
  // (180° at most; a longer arc is two segments). fillet rounds the corner at a point between two straight segments.

  // the arc from a to b with signed radius r: centre, radius (at least half the chord), sweep (signed, radians)
  function arcSeg(a, b, r) {
    const c = dist(a, b), ccw = r > 0;
    let R = Math.abs(r); if (R < c / 2) R = c / 2;
    const h = Math.sqrt(Math.max(0, R * R - c * c / 4)), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ux = (b[0] - a[0]) / (c || 1), uy = (b[1] - a[1]) / (c || 1), sg = ccw ? 1 : -1;
    const ctr = [m[0] - uy * h * sg, m[1] + ux * h * sg];
    const sweep = 2 * Math.asin(Math.min(1, c / (2 * R))) * sg;
    return { c: ctr, R, sweep, a0: Math.atan2(a[1] - ctr[1], a[0] - ctr[0]) };
  }
  // points strictly between a and b along the arc
  // the angle step that keeps a chord within SAG of the true arc (and no coarser than step)
  const SAG = 0.00005;
  const arcStep = (R, step) => Math.min(step, R > SAG ? 2 * Math.acos(1 - SAG / R) : step);
  function arcInner(a, b, r, step) {
    const A = arcSeg(a, b, r), k = Math.max(1, Math.ceil(Math.abs(A.sweep) / arcStep(A.R, step))), o = [];
    for (let j = 1; j < k; j++) { const t = A.a0 + A.sweep * j / k; o.push([A.c[0] + A.R * Math.cos(t), A.c[1] + A.R * Math.sin(t)]); }
    return o;
  }
  // The arc from a through m to b: its signed radius, and the points to put between a and b so each piece is
  // 180° or less (a midpoint when the arc goes the long way round). null when the three points are in a line.
  function arcThrough(a, m, b) {
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    if (Math.abs(d) < 1e-12 || dist(a, b) < 1e-9) return null;
    const a2 = a[0] * a[0] + a[1] * a[1], m2 = m[0] * m[0] + m[1] * m[1], b2 = b[0] * b[0] + b[1] * b[1];
    const c = [(a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d, (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d];
    const R = dist(a, c), ccw = (m[0] - a[0]) * (b[1] - m[1]) - (m[1] - a[1]) * (b[0] - m[0]) > 0;
    const ang = p => Math.atan2(p[1] - c[1], p[0] - c[0]);
    let sw = ang(b) - ang(a); if (ccw) { while (sw <= 0) sw += 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; }
    const r = ccw ? R : -R;
    if (Math.abs(sw) <= Math.PI + 1e-9) return { r, mids: [] };
    const t = ang(a) + sw / 2;
    return { r, mids: [[c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]] };
  }
  // A shape as a polyline: arcs sampled, fillets rounded off.
  function filleted(shape, stepDeg) {
    const P = (shape.pts || []).map(p => [+p[0], +p[1], Math.abs(+p[2] || 0), +p[3] || 0]).filter(p => isFinite(p[0]) && isFinite(p[1]));
    const pts = [];
    for (const p of P) { const l = pts[pts.length - 1]; if (!l || dist(l, p) > 1e-7) pts.push(p); else if (p[3]) l[3] = p[3]; }
    if (shape.closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-7) pts.pop();
    const n = pts.length, closed = !!shape.closed && n >= 2, out = [], step = (stepDeg || 1) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const p = pts[i], r = p[2], prev = pts[(i - 1 + n) % n];
      const hasP = closed || i > 0, hasN = closed || i < n - 1;
      const lines = hasP && hasN && !prev[3] && !p[3];              // fillets only between two straight segments
      if (!r || !lines) out.push([p[0], p[1]]);
      else {
        const a = prev, b = pts[(i + 1) % n];
        const u1 = [(p[0] - a[0]) / dist(a, p), (p[1] - a[1]) / dist(a, p)], u2 = [(b[0] - p[0]) / dist(p, b), (b[1] - p[1]) / dist(p, b)];
        const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]);   // signed turn angle
        if (Math.abs(turn) < 1e-6 || Math.abs(Math.abs(turn) - Math.PI) < 1e-6) out.push([p[0], p[1]]);
        else {
          let t = r * Math.tan(Math.abs(turn) / 2);
          const room = Math.min(dist(a, p), dist(p, b)) * (closed || (i > 1 && i < n - 2) ? 0.5 : 1);
          let rr = r;
          if (t > room) { t = room; rr = t / Math.tan(Math.abs(turn) / 2); }
          const s0 = [p[0] - u1[0] * t, p[1] - u1[1] * t], sg = Math.sign(turn);
          const nrm = [-u1[1] * sg, u1[0] * sg], c = [s0[0] + nrm[0] * rr, s0[1] + nrm[1] * rr];
          const a0 = Math.atan2(s0[1] - c[1], s0[0] - c[0]), k = Math.max(2, Math.ceil(Math.abs(turn) / arcStep(rr, step)));
          for (let j = 0; j <= k; j++) { const ang = a0 + turn * j / k; out.push([c[0] + rr * Math.cos(ang), c[1] + rr * Math.sin(ang)]); }
        }
      }
      if (p[3] && hasN) out.push(...arcInner(p, pts[(i + 1) % n], p[3], step));
    }
    return out;
  }

  // A closed shape's edges as polylines, split by whether they are marked open (pts[i][4]): {open: [...], walls: [...]}.
  // Each edge is from point i to point i+1 (a line or its arc); runs of neighbouring edges of the same kind are joined.
  function edgeRuns(shape) {
    const P = (shape.pts || []).map(p => [+p[0], +p[1], +p[2] || 0, +p[3] || 0, +p[4] ? 1 : 0]), n = P.length, out = { open: [], walls: [] };
    if (!shape.closed || n < 2) return out;
    const edge = i => { const a = P[i], b = P[(i + 1) % n]; return [[a[0], a[1]]].concat(a[3] ? arcInner(a, b, a[3], Math.PI / 180) : [], [[b[0], b[1]]]); };
    let start = 0; while (start < n && P[(start - 1 + n) % n][4] === P[start][4]) start++;
    if (start === n) { out[P[0][4] ? 'open' : 'walls'].push(filleted(shape).concat([filleted(shape)[0]])); return out; }
    let cur = null, kind = null;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n, kd = P[i][4] ? 'open' : 'walls';
      if (kd !== kind) { if (cur) out[kind].push(cur); cur = edge(i); kind = kd; } else cur = cur.concat(edge(i).slice(1));
    }
    if (cur) out[kind].push(cur);
    return out;
  }

  function segDist(p, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)) : 0;
    return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
  }
  function polyLen(P, closed) { let s = 0; for (let i = 1; i < P.length; i++) s += dist(P[i - 1], P[i]); if (closed) s += dist(P[P.length - 1], P[0]); return s; }
  // point and unit direction at arc length s along a polyline
  function at(P, closed, s, cum) {
    const n = P.length, m = closed ? n : n - 1, L = cum[cum.length - 1];
    if (closed) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
    let lo = 0, hi = m - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = P[lo], b = P[(lo + 1) % n], seg = cum[lo + 1] - cum[lo] || 1e-12, t = (s - cum[lo]) / seg;
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg] };
  }
  function cumLen(P, closed) { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + dist(P[i - 1], P[i])); if (closed) c.push(c[c.length - 1] + dist(P[P.length - 1], P[0])); return c; }
  // the direction at s, smoothed over a window so a trochoid turns gently at polyline corners
  function dirAt(P, closed, s, cum, w) {
    const a = at(P, closed, s - w, cum).p, b = at(P, closed, s + w, cum).p, L = dist(a, b);
    return L > 1e-9 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : at(P, closed, s, cum).d;
  }
  function removeDup(P) { const o = []; for (const p of P) { const l = o[o.length - 1]; if (!l || dist(l, p) > 1e-6) o.push(p); } return o; }

  // ---------------------------------------------------------------- shapes as text
  // One point per line: X, Y and then, if wanted, fillet R, arc R (+ counter-clockwise, − clockwise) and open (1 or
  // "open": the edge to the next point has air beyond it). Commas, tabs (a spreadsheet paste), spaces or semicolons.
  // A line starting with # (or naming a shape: "shape 2 closed", "open path") starts a new shape; a blank line does
  // too. A header row of words is skipped.
  function shapesToText(shapes) {
    const n = v => String(+(+v || 0).toFixed(5));
    return shapes.map((sh, i) => '# shape ' + (i + 1) + ' ' + (sh.closed ? 'closed' : 'open') + (sh.cut === false ? ' cad only' : '') + '\n' +
      sh.pts.map(p => { const row = [n(p[0]), n(p[1])]; const f = +p[2] || 0, a = +p[3] || 0, o = +p[4] ? 1 : 0; if (f || a || o) row.push(n(f)); if (a || o) row.push(n(a)); if (o) row.push('1'); return row.join(', '); }).join('\n')).join('\n\n') + '\n';
  }
  // -> {shapes, errors: [{line, text}]}; closed: what a shape is when nothing says (true, or false for paths)
  function shapesFromText(text, closed) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n'), shapes = [], errors = [];
    let cur = null;
    const begin = c => { cur = { closed: c === undefined ? closed !== false : c, pts: [] }; shapes.push(cur); };
    lines.forEach((raw, li) => {
      const line = raw.trim();
      if (!line) { if (cur && cur.pts.length) cur = null; return; }
      const head = /^#|^(shape|path|closed|open)\b/i.test(line) && !/^[-+.\d]/.test(line);
      if (head) { const c = /\bopen\b/i.test(line) && !/\bclosed\b/i.test(line) ? false : /\bclosed\b/i.test(line) ? true : undefined; begin(c); if (/\bcad\b|no cut|not? machin/i.test(line)) cur.cut = false; return; }
      // tabs or commas keep their empty cells in place (a blank fillet column); otherwise spaces separate
      const cells = /\t/.test(raw) ? raw.trim().split('\t').map(x => x.trim()) : /[,;]/.test(line) ? line.split(/[,;]/).map(x => x.trim()) : line.split(/\s+/);
      if (!cells.some(x => x !== '')) return;
      // a header row of words (X Y Fillet ...) is skipped
      if (cells.every(x => x === '' || !isFinite(parseFloat(x)))) return;
      const nums = cells.slice(0, 4).map(x => (x === '' ? 0 : parseFloat(x)));
      if (nums.length < 2 || !isFinite(nums[0]) || !isFinite(nums[1]) || nums.slice(2).some(v => !isFinite(v))) { errors.push({ line: li + 1, text: raw }); return; }
      const open = cells[4] !== undefined && (/^(1|open|o|yes|y|true)$/i.test(cells[4]));
      if (!cur) begin();
      const p = [nums[0], nums[1], Math.abs(nums[2] || 0), nums[3] || 0];
      if (open) p.push(1);
      cur.pts.push(p);
    });
    const out = shapes.filter(s => s.pts.length);
    out.forEach(s => { if (s.closed && s.pts.length < 3 && !s.pts.some(p => p[3])) s.closed = false; });
    return { shapes: out, errors };
  }

  // ---------------------------------------------------------------- construction geometry
  // {t:'point', x, y} | {t:'line', x, y, a} (endless, through the point at a degrees) | {t:'line2', x1, y1, x2, y2}
  // (endless, through both) | {t:'circle', x, y, d}. Lines come back as a point and a unit direction.
  function consParts(cons) {
    const pts = [], lines = [], circles = [];
    for (const g of cons || []) {
      if (g.t === 'point') pts.push([+g.x, +g.y]);
      else if (g.t === 'line') { const a = (+g.a || 0) * Math.PI / 180; lines.push({ p: [+g.x, +g.y], u: [Math.cos(a), Math.sin(a)] }); pts.push([+g.x, +g.y]); }
      else if (g.t === 'line2') { const L = Math.hypot(g.x2 - g.x1, g.y2 - g.y1); if (L > 1e-9) { lines.push({ p: [+g.x1, +g.y1], u: [(g.x2 - g.x1) / L, (g.y2 - g.y1) / L] }); pts.push([+g.x1, +g.y1], [+g.x2, +g.y2]); } }
      else if (g.t === 'circle') { const r = Math.abs(+g.d) / 2; if (r > 0) { circles.push({ c: [+g.x, +g.y], r }); pts.push([+g.x, +g.y]); } }
    }
    return { pts, lines, circles };
  }
  // where construction lines and circles cross each other
  function consCrossings(cons) {
    const { lines, circles } = consParts(cons), out = [];
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j], den = a.u[0] * b.u[1] - a.u[1] * b.u[0]; if (Math.abs(den) < 1e-12) continue;
      const t = ((b.p[0] - a.p[0]) * b.u[1] - (b.p[1] - a.p[1]) * b.u[0]) / den; out.push([a.p[0] + a.u[0] * t, a.p[1] + a.u[1] * t]);
    }
    for (const l of lines) for (const c of circles) {
      const dx = l.p[0] - c.c[0], dy = l.p[1] - c.c[1], b = dx * l.u[0] + dy * l.u[1], q = b * b - (dx * dx + dy * dy - c.r * c.r);
      if (q < -1e-12) continue; const sq = Math.sqrt(Math.max(0, q));
      for (const t of q < 1e-12 ? [-b] : [-b - sq, -b + sq]) out.push([l.p[0] + l.u[0] * t, l.p[1] + l.u[1] * t]);
    }
    for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
      const A = circles[i], Bc = circles[j], d = dist(A.c, Bc.c); if (d < 1e-12 || d > A.r + Bc.r + 1e-9 || d < Math.abs(A.r - Bc.r) - 1e-9) continue;
      const a = (A.r * A.r - Bc.r * Bc.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)), mx = A.c[0] + a * (Bc.c[0] - A.c[0]) / d, my = A.c[1] + a * (Bc.c[1] - A.c[1]) / d;
      out.push([mx + h * (Bc.c[1] - A.c[1]) / d, my - h * (Bc.c[0] - A.c[0]) / d]); if (h > 1e-9) out.push([mx - h * (Bc.c[1] - A.c[1]) / d, my + h * (Bc.c[0] - A.c[0]) / d]);
    }
    return out;
  }
  // The point to snap p to, within tol: a construction point, centre or crossing, or a shape's point, first;
  // otherwise the nearest point on a construction line or circle. null when nothing is near.
  function consSnap(p, cons, shapes, tol) {
    const { pts, lines, circles } = consParts(cons);
    let best = null, bd = tol;
    const cand = pts.concat(consCrossings(cons));
    for (const sh of shapes || []) {
      const P = sh.pts, n = P.length;
      for (const q of P) cand.push([+q[0], +q[1]]);
      // the middle of each segment (on the arc for an arc)
      for (let j = 0; j < (sh.closed ? n : n - 1); j++) { const a = P[j], b = P[(j + 1) % n]; if (+a[3]) { const A = arcSeg([+a[0], +a[1]], [+b[0], +b[1]], +a[3]), t = A.a0 + A.sweep / 2; cand.push([A.c[0] + A.R * Math.cos(t), A.c[1] + A.R * Math.sin(t)]); } else cand.push([(+a[0] + +b[0]) / 2, (+a[1] + +b[1]) / 2]); }
    }
    for (const q of cand) { const d = dist(p, q); if (d < bd) { bd = d; best = { p: q, kind: 'point' }; } }
    if (best) return best;
    bd = tol;
    for (const l of lines) { const t = (p[0] - l.p[0]) * l.u[0] + (p[1] - l.p[1]) * l.u[1], q = [l.p[0] + l.u[0] * t, l.p[1] + l.u[1] * t], d = dist(p, q); if (d < bd) { bd = d; best = { p: q, kind: 'line' }; } }
    for (const c of circles) { const d0 = dist(p, c.c); if (d0 < 1e-12) continue; const q = [c.c[0] + (p[0] - c.c[0]) / d0 * c.r, c.c[1] + (p[1] - c.c[1]) / d0 * c.r], d = Math.abs(d0 - c.r); if (d < bd) { bd = d; best = { p: q, kind: 'circle' }; } }
    return best;
  }

  // ---------------------------------------------------------------- changing shapes
  // Every point of the shapes through f([x, y]) -> [x, y]. Radii (fillet, arc) are scaled by k; a mirror (flip)
  // turns each arc the other way, so it stays the same curve. Open-edge flags go with their points.
  const r5 = v => Math.round(v * 1e5) / 1e5;
  function mapShapes(shapes, f, k, flip) {
    return shapes.map(sh => ({ ...sh, pts: sh.pts.map(p => {
      const q = f([+p[0], +p[1]]), out = [r5(q[0]), r5(q[1]), r5(Math.abs(+p[2] || 0) * (k || 1)), r5((+p[3] || 0) * (k || 1) * (flip ? -1 : 1))];
      if (+p[4]) out.push(1);
      return out;
    }) }));
  }
  const moveShapes = (shapes, dx, dy) => mapShapes(shapes, p => [p[0] + dx, p[1] + dy]);
  function rotateShapes(shapes, deg, c) {
    const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    return mapShapes(shapes, p => [c[0] + (p[0] - c[0]) * co - (p[1] - c[1]) * si, c[1] + (p[0] - c[0]) * si + (p[1] - c[1]) * co]);
  }
  const scaleShapes = (shapes, k, c) => mapShapes(shapes, p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k], Math.abs(k));
  // axis 'x': flip left-right (about the vertical line through c); 'y': flip up-down
  const mirrorShapes = (shapes, axis, c) => mapShapes(shapes, p => axis === 'x' ? [2 * c[0] - p[0], p[1]] : [p[0], 2 * c[1] - p[1]], 1, true);
  // the extents of shapes as drawn (arcs and fillets included): [minX, minY, maxX, maxY], or null
  function shapesBox(shapes) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const sh of shapes) for (const p of filleted(sh)) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
    return isFinite(b[0]) ? b : null;
  }

  // ---------------------------------------------------------------- arc fitting (from the engraving app)
  function circ3(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null;
    const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return [x, y, Math.hypot(a[0] - x, a[1] - y)];
  }
  function lineOk(P, i, j, tol) {
    const a = P[i], b = P[j], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 1e-9) return false; let lt = -1e-9;
    for (let k = i + 1; k < j; k++) { const t = ((P[k][0] - a[0]) * dx + (P[k][1] - a[1]) * dy) / L; if (t < lt - 1e-9 || t > L + 1e-9) return false; lt = t; if (Math.abs((P[k][0] - a[0]) * dy - (P[k][1] - a[1]) * dx) / L > tol) return false; }
    return true;
  }
  function arcOk(P, i, j, tol) {
    const m = (i + j) >> 1, c = circ3(P[i], P[m], P[j]); if (!c || c[2] > 50) return null;
    const ccw = (P[m][0] - P[i][0]) * (P[j][1] - P[m][1]) - (P[m][1] - P[i][1]) * (P[j][0] - P[m][0]) > 0;
    let sweep = 0, prev = Math.atan2(P[i][1] - c[1], P[i][0] - c[0]);
    for (let k = i + 1; k <= j; k++) {
      if (Math.abs(Math.hypot(P[k][0] - c[0], P[k][1] - c[1]) - c[2]) > tol) return null;
      const a = Math.atan2(P[k][1] - c[1], P[k][0] - c[0]); let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (ccw ? d <= 0 : d >= 0) return null; if (Math.abs(d) > Math.PI / 2) return null;
      const mx = (P[k][0] + P[k - 1][0]) / 2, my = (P[k][1] + P[k - 1][1]) / 2, sag = c[2] - Math.hypot(mx - c[0], my - c[1]); if (sag > tol * 4) return null;
      sweep += Math.abs(d); prev = a;
    }
    if (sweep > 175 * Math.PI / 180) return null;
    return { c: [c[0], c[1]], r: c[2], ccw };
  }
  // polyline -> [{t:'L', x, y} | {t:'A', ccw, x, y, cx, cy}] from P[0]
  function fitPath(P, tol) {
    const segs = [], n = P.length; let i = 0;
    while (i < n - 1) {
      let jl = i + 1; while (jl + 1 < n && jl - i < 400 && lineOk(P, i, jl + 1, tol)) jl++;
      let ja = -1, arc = null; for (let j = i + 2; j < n && j - i < 400; j++) { const a = arcOk(P, i, j, tol); if (!a) break; ja = j; arc = a; }
      if (arc && ja > jl) { segs.push({ t: 'A', ccw: arc.ccw, x: P[ja][0], y: P[ja][1], cx: arc.c[0], cy: arc.c[1] }); i = ja; }
      else { segs.push({ t: 'L', x: P[jl][0], y: P[jl][1] }); i = jl; }
    }
    return segs;
  }

  // ---------------------------------------------------------------- DXF (from the engraving app)
  // Entities become paths [x,y,bulge, x,y,bulge, ...] in drawing units; bulge = tan(angle/4). Joined end to end.
  const DXF_UNITS = { 1: 1, 2: 12, 4: 1 / 25.4, 5: 1 / 2.54, 6: 1000 / 25.4, 8: 1e-6, 9: 0.001, 10: 36 };
  function dxfArcPts(x1, y1, x2, y2, b, stepDeg) {
    const th = 4 * Math.atan(b), dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (Math.abs(b) < 1e-12 || L < 1e-12) return [[x2, y2]];
    const d = L / 2 / Math.tan(th / 2), cx = (x1 + x2) / 2 - dy / L * d, cy = (y1 + y2) / 2 + dx / L * d, r = Math.hypot(x1 - cx, y1 - cy), a0 = Math.atan2(y1 - cy, x1 - cx);
    const n = Math.max(1, Math.ceil(Math.abs(th) * 180 / Math.PI / stepDeg - 1e-9)), o = [];
    for (let k = 1; k < n; k++) { const a = a0 + th * k / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    o.push([x2, y2]); return o;
  }
  function dxfPathPts(p, stepDeg) { const o = [[p[0], p[1]]]; for (let i = 0; i + 3 < p.length; i += 3) o.push(...dxfArcPts(p[i], p[i + 1], p[i + 3], p[i + 4], p[i + 2], stepDeg)); return o; }
  function parseDXF(txt) {
    const s = String(txt);
    if (/^AutoCAD Binary DXF/.test(s)) throw new Error('This is a binary DXF. Save it as an ASCII DXF and import that.');
    const L = s.split(/\r\n|\r|\n/), P = [];
    for (let i = 0; i + 1 < L.length; i += 2) { const k = L[i].trim(); if (k === '' && i >= L.length - 2) break; if (!/^-?\d+$/.test(k)) throw new Error('This is not a DXF file this app can read.'); P.push([+k, L[i + 1].trim()]); }
    let units = 0, sec = '', blk = null, i = 0; const blocks = {}, ents = [];
    const take = () => { const e = { t: P[i][1], g: [] }; i++; while (i < P.length && P[i][0] !== 0) { e.g.push(P[i]); i++; } return e; };
    while (i < P.length) {
      const [k, v] = P[i];
      if (k === 0 && v === 'SECTION') { sec = P[i + 1] && P[i + 1][0] === 2 ? P[i + 1][1] : ''; i += 2; continue; }
      if (k === 0 && v === 'ENDSEC') { sec = ''; i++; continue; }
      if (k === 0 && v === 'EOF') break;
      if (sec === 'HEADER') { if (k === 9 && v === '$INSUNITS' && P[i + 1] && P[i + 1][0] === 70) units = parseInt(P[i + 1][1], 10) || 0; i++; continue; }
      if (sec === 'BLOCKS' && k === 0) { const e = take(); if (e.t === 'BLOCK') blk = { name: gs(e, 2), bx: gf(e, 10), by: gf(e, 20), ents: [] }; else if (e.t === 'ENDBLK') { if (blk) blocks[blk.name] = blk; blk = null; } else if (blk) blk.ents.push(e); continue; }
      if (sec === 'ENTITIES' && k === 0) { ents.push(take()); continue; }
      i++;
    }
    function gs(e, c) { const g = e.g.find(q => q[0] === c); return g ? g[1] : ''; }
    function gf(e, c, d = 0) { const g = e.g.find(q => q[0] === c); const n = g ? parseFloat(g[1]) : NaN; return isFinite(n) ? n : d; }
    const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
    const I = [1, 0, 0, 1, 0, 0], tr = (x, y) => [1, 0, 0, 1, x, y], rotm = r => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0], scl = (x, y) => [x, 0, 0, y, 0, 0];
    const skipped = {}, paths = []; let nEnt = 0;
    const cnt = t => { skipped[t] = (skipped[t] || 0) + 1; };
    const mir = (p, e) => { if (gf(e, 230, 1) >= 0) return p; const o = []; for (let j = 0; j < p.length; j += 3) o.push(-p[j], p[j + 1], -p[j + 2]); return o; };
    function xform(p, M) {
      if (M === I) return p;
      const det = M[0] * M[3] - M[1] * M[2], ap = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]], o = [];
      const sim = Math.abs(M[0] * M[2] + M[1] * M[3]) < 1e-9 && Math.abs(M[0] * M[0] + M[1] * M[1] - M[2] * M[2] - M[3] * M[3]) < 1e-9;
      if (sim) { for (let j = 0; j < p.length; j += 3) { const [x, y] = ap(p[j], p[j + 1]); o.push(x, y, det < 0 ? -p[j + 2] : p[j + 2]); } return o; }
      dxfPathPts(p, 3).forEach(([x, y]) => { const [a, b] = ap(x, y); o.push(a, b, 0); }); return o;
    }
    function entPaths(e, list, j) {
      const T = e.t;
      if (T === 'LINE') return { ps: [[gf(e, 10), gf(e, 20), 0, gf(e, 11), gf(e, 21), 0]] };
      if (T === 'CIRCLE') { const x = gf(e, 10), y = gf(e, 20), r = gf(e, 40); if (!(r > 0)) return null; return { ps: [mir([x + r, y, 1, x - r, y, 1, x + r, y, 0], e)] }; }
      if (T === 'ARC') {
        const x = gf(e, 10), y = gf(e, 20), r = gf(e, 40), a0 = gf(e, 50) * Math.PI / 180; let sw = ((gf(e, 51) - gf(e, 50)) % 360 + 360) % 360; if (sw < 1e-9) sw = 360; if (!(r > 0)) return null;
        const a1 = a0 + sw * Math.PI / 180, pt = a => [x + r * Math.cos(a), y + r * Math.sin(a)];
        if (sw >= 360) { const [p1, p2] = [pt(a0), pt(a0 + Math.PI)]; return { ps: [mir([p1[0], p1[1], 1, p2[0], p2[1], 1, p1[0], p1[1], 0], e)] }; }
        const [s1, s2] = pt(a0), [e1, e2] = pt(a1); return { ps: [mir([s1, s2, Math.tan(sw * Math.PI / 720), e1, e2, 0], e)] };
      }
      if (T === 'LWPOLYLINE') {
        const v = []; e.g.forEach(([c, val]) => { if (c === 10) v.push([parseFloat(val), 0, 0]); else if (c === 20 && v.length) v[v.length - 1][1] = parseFloat(val); else if (c === 42 && v.length) v[v.length - 1][2] = parseFloat(val) || 0; });
        if (v.length < 2) return null; if (gf(e, 70, 0) & 1) v.push([v[0][0], v[0][1], 0]); else v[v.length - 1][2] = 0; return { ps: [mir(v.flat(), e)] };
      }
      if (T === 'POLYLINE') {
        const vs = []; let k = j; while (k + 1 < list.length && list[k + 1].t === 'VERTEX') vs.push(list[++k]); if (k + 1 < list.length && list[k + 1].t === 'SEQEND') k++;
        const fl = gf(e, 70, 0); if (fl & (16 | 64)) { cnt('POLYLINE MESH'); return { ps: [], skip: k }; }
        const v = vs.filter(q => !(gf(q, 70, 0) & 16)).map(q => [gf(q, 10), gf(q, 20), fl & 8 ? 0 : gf(q, 42, 0)]);
        if (v.length < 2) return { ps: [], skip: k }; if (fl & 1) v.push([v[0][0], v[0][1], 0]); else v[v.length - 1][2] = 0; return { ps: [mir(v.flat(), e)], skip: k };
      }
      if (T === 'SPLINE') {
        const deg = gf(e, 71, 3), kn = e.g.filter(q => q[0] === 40).map(q => +q[1]), w = e.g.filter(q => q[0] === 41).map(q => +q[1]);
        const pairs = (cx, cy) => { const o = []; let cur = null; e.g.forEach(([c, v]) => { if (c === cx) { cur = [parseFloat(v), 0]; o.push(cur); } else if (c === cy && cur) cur[1] = parseFloat(v); }); return o; };
        const cp = pairs(10, 20), fp = pairs(11, 21); let pts = [];
        if (cp.length > deg && kn.length === cp.length + deg + 1) {
          const W = w.length === cp.length ? w : cp.map(() => 1), n = cp.length;
          const atU = u => {
            let k = deg; while (k < n - 1 && !(u < kn[k + 1])) k++; const d = [];
            for (let q = 0; q <= deg; q++) { const c = cp[k - deg + q], ww = W[k - deg + q]; d.push([c[0] * ww, c[1] * ww, ww]); }
            for (let r = 1; r <= deg; r++) for (let q = deg; q >= r; q--) { const a0 = kn[k - deg + q], a1 = kn[k + 1 + q - r], al = a1 > a0 ? (u - a0) / (a1 - a0) : 0; d[q] = [0, 1, 2].map(z => (1 - al) * d[q - 1][z] + al * d[q][z]); }
            return [d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]];
          };
          for (let k = deg; k < n; k++) { const u0 = kn[k], u1 = kn[k + 1]; if (!(u1 > u0)) continue; for (let q = pts.length ? 1 : 0; q <= 32; q++) pts.push(atU(u0 + (u1 - u0) * q / 32)); }
        } else if (fp.length >= 2) pts = fp;
        if (pts.length < 2) return null; return { ps: [pts.flatMap(q => [q[0], q[1], 0])] };
      }
      if (T === 'ELLIPSE') {
        const x = gf(e, 10), y = gf(e, 20), mx = gf(e, 11), my = gf(e, 21), k = gf(e, 40, 1), zs = gf(e, 230, 1) < 0 ? -1 : 1; let t0 = gf(e, 41, 0), t1 = gf(e, 42, 2 * Math.PI); if (t1 <= t0 + 1e-12) t1 += 2 * Math.PI;
        const nx = -my * k * zs, ny = mx * k * zs, n = Math.max(8, Math.ceil((t1 - t0) / (2 * Math.PI) * 180)), o = [];
        for (let q = 0; q <= n; q++) { const a = t0 + (t1 - t0) * q / n; o.push(x + mx * Math.cos(a) + nx * Math.sin(a), y + my * Math.cos(a) + ny * Math.sin(a), 0); } return { ps: [o] };
      }
      return null;
    }
    const walk = (list, M, depth) => {
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (['VERTEX', 'SEQEND', 'ATTRIB', 'ATTDEF'].includes(e.t)) continue;
        if (e.t === 'INSERT') {
          const b = blocks[gs(e, 2)]; if (!b || depth >= 8) { cnt('INSERT'); continue; }
          let N = mul(mul(tr(gf(e, 10), gf(e, 20)), rotm(gf(e, 50) * Math.PI / 180)), mul(scl(gf(e, 41, 1), gf(e, 42, 1)), tr(-b.bx, -b.by)));
          if (gf(e, 230, 1) < 0) N = mul(scl(-1, 1), N); walk(b.ents, M === I ? N : mul(M, N), depth + 1); continue;
        }
        const r = entPaths(e, list, j); if (!r) { cnt(e.t); continue; }
        if (r.skip != null) j = r.skip; nEnt++; r.ps.forEach(p => paths.push(xform(p, M)));
      }
    };
    walk(ents, I, 0);
    return { units, n: nEnt, skipped, paths: dxfChain(paths) };
  }
  function dxfChain(paths) {
    const eps = 1e-5, near = (a, b) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
    const st = p => [p[0], p[1]], en = p => [p[p.length - 3], p[p.length - 2]];
    const rev = p => { const n = p.length / 3, o = []; for (let i = n - 1; i >= 0; i--) o.push(p[3 * i], p[3 * i + 1], i > 0 ? -p[3 * (i - 1) + 2] : 0); return o; };
    const join = (a, b) => [...a.slice(0, -3), ...b];
    const open = [], out = []; paths.forEach(p => { if (p.length < 6) return; (p.length >= 9 && near(st(p), en(p)) ? out : open).push(p); });
    if (open.length > 3000) return [...out, ...open];
    const used = open.map(() => false);
    for (let i = 0; i < open.length; i++) {
      if (used[i]) continue; used[i] = true; let cur = open[i], grew = true;
      while (grew && !near(st(cur), en(cur))) {
        grew = false;
        for (let j = 0; j < open.length; j++) {
          if (used[j]) continue; const q = open[j];
          if (near(en(cur), st(q))) cur = join(cur, q); else if (near(en(cur), en(q))) cur = join(cur, rev(q));
          else if (near(st(cur), en(q))) cur = join(q, cur); else if (near(st(cur), st(q))) cur = join(rev(q), cur); else continue;
          used[j] = true; grew = true;
        }
      }
      out.push(cur);
    }
    return out;
  }
  // DXF text -> shapes {closed, pts:[[x,y,0]]} in inches (units: 'auto' | 'in' | 'mm')
  function dxfShapes(text, units) {
    const D = parseDXF(text), k = units === 'in' ? 1 : units === 'mm' ? 1 / 25.4 : (DXF_UNITS[D.units] || 1);
    const r5 = v => +v.toFixed(5);
    const shapes = D.paths.map(p => {
      // [x, y, bulge] triples -> points with the arc on the segment that starts there; bulge = tan(sweep / 4)
      const pts = [];
      for (let i = 0; i + 2 < p.length; i += 3) {
        const a = [p[i] * k, p[i + 1] * k], b = i + 5 < p.length ? [p[i + 3] * k, p[i + 4] * k] : null, bu = b ? p[i + 2] : 0;
        const l = pts[pts.length - 1];
        if (l && dist(l, a) < 1e-7) { if (bu) l[3] = 0; } else pts.push([r5(a[0]), r5(a[1]), 0, 0]);
        if (!b || Math.abs(bu) < 1e-9 || dist(a, b) < 1e-9) continue;
        const th = 4 * Math.atan(Math.abs(bu)), c = dist(a, b), R = c / (2 * Math.sin(th / 2)), sg = bu > 0 ? 1 : -1;
        if (th <= Math.PI + 1e-9) { pts[pts.length - 1][3] = r5(sg * R); continue; }
        // longer than a half circle: split at its middle
        const A = arcSeg(a, b, sg * R);   // the short way; the long way's centre is on the other side of the chord
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cc = [2 * m[0] - A.c[0], 2 * m[1] - A.c[1]];
        const a0 = Math.atan2(a[1] - cc[1], a[0] - cc[0]), mid = [cc[0] + R * Math.cos(a0 + sg * th / 2), cc[1] + R * Math.sin(a0 + sg * th / 2)];
        pts[pts.length - 1][3] = r5(sg * R);
        pts.push([r5(mid[0]), r5(mid[1]), 0, r5(sg * R)]);
      }
      const closed = pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-4;
      if (closed) pts.pop();
      return { closed, pts };
    }).filter(s => s.pts.length >= 2);
    return { shapes, skipped: D.skipped, units: D.units, n: D.n };
  }

  // ---------------------------------------------------------------- dimensions
  // The numbers of a drawing, from work zero: every point; every segment (length, angle, and for an arc its radius,
  // centre, direction and sweep); every fillet (radius, centre, where it starts and ends); each shape's size,
  // perimeter and area; the construction geometry and where it crosses. Degrees counter-clockwise from +X.
  const deg = a => { let d = a * 180 / Math.PI; while (d <= -180) d += 360; while (d > 180) d -= 360; return d; };
  // the fillet at p between a and b (both straight): {r, c, t1, t2} (t1 on the way in, t2 on the way out), or null
  function filletAt(a, p, b, r, room) {
    const la = dist(a, p), lb = dist(p, b); if (!(r > 0) || la < 1e-9 || lb < 1e-9) return null;
    const u1 = [(p[0] - a[0]) / la, (p[1] - a[1]) / la], u2 = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]);
    if (Math.abs(turn) < 1e-6 || Math.abs(Math.abs(turn) - Math.PI) < 1e-6) return null;
    let t = r * Math.tan(Math.abs(turn) / 2), rr = r;
    if (t > room) { t = room; rr = t / Math.tan(Math.abs(turn) / 2); }
    const sg = Math.sign(turn), t1 = [p[0] - u1[0] * t, p[1] - u1[1] * t], t2 = [p[0] + u2[0] * t, p[1] + u2[1] * t];
    return { r: rr, asked: r, c: [t1[0] - u1[1] * sg * rr, t1[1] + u1[0] * sg * rr], t1, t2, ccw: sg > 0 };
  }
  function dimensions(shapes, cons) {
    const out = { points: [], segments: [], fillets: [], shapes: [], cons: [], crossings: [] };
    (shapes || []).forEach((sh, si) => {
      const P = (sh.pts || []).map(p => [+p[0], +p[1], Math.abs(+p[2] || 0), +p[3] || 0, +p[4] ? 1 : 0]), n = P.length, closed = !!sh.closed && n >= 2;
      P.forEach((p, j) => out.points.push({ s: si + 1, n: j + 1, x: p[0], y: p[1], fillet: p[2], open: !!p[4], cut: sh.cut !== false }));
      const segs = closed ? n : n - 1;
      for (let j = 0; j < segs; j++) {
        const a = P[j], b = P[(j + 1) % n], seg = { s: si + 1, from: j + 1, to: (j + 1) % n + 1, open: !!a[4] };
        if (a[3]) {
          const A = arcSeg(a, b, a[3]);
          Object.assign(seg, { kind: 'arc', asked: Math.abs(a[3]), r: A.R, cx: A.c[0], cy: A.c[1], dir: a[3] > 0 ? 'CCW' : 'CW', sweep: Math.abs(A.sweep) * 180 / Math.PI, length: A.R * Math.abs(A.sweep), chord: dist(a, b), angle: deg(Math.atan2(b[1] - a[1], b[0] - a[0])) });
        } else Object.assign(seg, { kind: 'line', length: dist(a, b), angle: deg(Math.atan2(b[1] - a[1], b[0] - a[0])), dx: b[0] - a[0], dy: b[1] - a[1] });
        out.segments.push(seg);
      }
      // fillets: between two straight segments, as the drawing rounds them
      for (let j = 0; j < n; j++) {
        const p = P[j], prev = P[(j - 1 + n) % n];
        if (!p[2] || (!closed && (j === 0 || j === n - 1)) || prev[3] || p[3]) continue;
        const room = Math.min(dist(prev, p), dist(p, P[(j + 1) % n])) * (closed || (j > 1 && j < n - 2) ? 0.5 : 1);
        const f = filletAt(prev, p, P[(j + 1) % n], p[2], room);
        if (f) out.fillets.push({ s: si + 1, n: j + 1, r: f.r, asked: f.asked, cx: f.c[0], cy: f.c[1], x1: f.t1[0], y1: f.t1[1], x2: f.t2[0], y2: f.t2[1] });
      }
      const poly = filleted(sh), b = poly.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
      out.shapes.push({ s: si + 1, closed, cut: sh.cut !== false, points: n, minX: b[0], minY: b[1], maxX: b[2], maxY: b[3], width: b[2] - b[0], height: b[3] - b[1], perimeter: polyLen(poly, closed), area: closed ? Math.abs(area(poly)) : null });
    });
    (cons || []).forEach((g, i) => out.cons.push(Object.assign({ n: i + 1 }, g)));
    // crossings, without repeats
    for (const p of consCrossings(cons)) if (!out.crossings.some(q => dist(q, p) < 1e-6)) out.crossings.push(p);
    return out;
  }
  // a CSV of the dimensions (one table after another)
  function dimensionsCSV(d) {
    const f = v => (v === null || v === undefined ? '' : typeof v === 'number' ? String(+v.toFixed(5)) : String(v));
    const rows = [['Points'], ['Shape', 'Point', 'X', 'Y', 'Fillet R', 'Open edge after', 'Machined']];
    d.points.forEach(p => rows.push([p.s, p.n, p.x, p.y, p.fillet || '', p.open ? 'yes' : '', p.cut ? 'yes' : 'CAD only']));
    rows.push([], ['Segments'], ['Shape', 'From', 'To', 'Kind', 'Length', 'Angle', 'Radius', 'Centre X', 'Centre Y', 'Direction', 'Sweep']);
    d.segments.forEach(g => rows.push([g.s, g.from, g.to, g.kind, g.length, g.angle, g.r, g.cx, g.cy, g.dir, g.sweep]));
    if (d.fillets.length) { rows.push([], ['Fillets'], ['Shape', 'Point', 'Radius', 'Centre X', 'Centre Y', 'Start X', 'Start Y', 'End X', 'End Y']); d.fillets.forEach(q => rows.push([q.s, q.n, q.r, q.cx, q.cy, q.x1, q.y1, q.x2, q.y2])); }
    rows.push([], ['Shapes'], ['Shape', 'Closed', 'Width', 'Height', 'Min X', 'Min Y', 'Max X', 'Max Y', 'Perimeter', 'Area']);
    d.shapes.forEach(q => rows.push([q.s, q.closed ? 'yes' : 'no', q.width, q.height, q.minX, q.minY, q.maxX, q.maxY, q.perimeter, q.area]));
    if (d.cons.length) { rows.push([], ['Construction'], ['#', 'Kind', 'X', 'Y', 'Angle', 'X2', 'Y2', 'Diameter']); d.cons.forEach(g => rows.push([g.n, g.t, g.x ?? g.x1, g.y ?? g.y1, g.a, g.x2, g.y2, g.d])); }
    if (d.crossings.length) { rows.push([], ['Construction crossings'], ['#', 'X', 'Y']); d.crossings.forEach((p, i) => rows.push([i + 1, p[0], p[1]])); }
    return rows.map(r => r.map(f).map(v => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(',')).join('\n') + '\n';
  }
  // distance, offsets and angle from a to b
  function measure(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; return { d: Math.hypot(dx, dy), dx, dy, angle: deg(Math.atan2(dy, dx)) }; }

  // ---------------------------------------------------------------- drawing exactly
  // A typed point: "x,y" (absolute), "@dx,dy" (from the last point) or "@length<angle" (degrees). null if unreadable.
  function parsePoint(text, last) {
    const t = String(text).trim().replace(/\s+/g, '');
    let m = /^@(-?[\d.]+)<(-?[\d.]+)$/.exec(t);
    if (m && last) { const L = +m[1], a = +m[2] * Math.PI / 180; return [last[0] + L * Math.cos(a), last[1] + L * Math.sin(a)]; }
    m = /^@(-?[\d.]+)[,;](-?[\d.]+)$/.exec(t);
    if (m && last) return [last[0] + +m[1], last[1] + +m[2]];
    m = /^(-?[\d.]+)[,;](-?[\d.]+)$/.exec(t);
    if (m) return [+m[1], +m[2]];
    return null;
  }
  // The arc from p0 that leaves in direction d (unit) and ends at p1: its signed radius (+ CCW) and the points to put
  // between when it goes past 180°. null when p1 is straight ahead (no arc).
  function tangentArc(p0, d, p1) {
    const v = [p1[0] - p0[0], p1[1] - p0[1]], nl = [-d[1], d[0]], h = v[0] * nl[0] + v[1] * nl[1];
    if (Math.abs(h) < 1e-9) return null;
    const r = (v[0] * v[0] + v[1] * v[1]) / (2 * h), c = [p0[0] + nl[0] * r, p0[1] + nl[1] * r], R = Math.abs(r);
    // a point on the arc a little way along, to pick the right way round (the way it leaves)
    const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), dir = r > 0 ? 1 : -1, a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    let sw = (a1 - a0) * dir; while (sw <= 0) sw += 2 * Math.PI; while (sw > 2 * Math.PI) sw -= 2 * Math.PI;
    const mid = a0 + dir * sw / 2, T = arcThrough(p0, [c[0] + R * Math.cos(mid), c[1] + R * Math.sin(mid)], p1);
    return T;
  }
  // the direction a shape leaves its last point (open) or the tangent at the end of its last segment
  function endDir(pts) {
    const n = pts.length; if (n < 2) return null;
    const a = pts[n - 2], b = pts[n - 1];
    if (+a[3]) { const A = arcSeg(a, b, +a[3]), t = A.a0 + A.sweep, u = [-Math.sin(t), Math.cos(t)]; return A.sweep > 0 ? u : [-u[0], -u[1]]; }
    const L = dist(a, b); return L > 1e-12 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : null;
  }
  // where a ray (from p, direction u) meets construction lines and circles and the outlines of shapes: distances t
  function rayHits(p, u, cons, polylines) {
    const { lines, circles } = consParts(cons), out = [];
    for (const l of lines) { const den = u[0] * l.u[1] - u[1] * l.u[0]; if (Math.abs(den) < 1e-12) continue; out.push(((l.p[0] - p[0]) * l.u[1] - (l.p[1] - p[1]) * l.u[0]) / den); }
    for (const c of circles) { const dx = p[0] - c.c[0], dy = p[1] - c.c[1], b = dx * u[0] + dy * u[1], q = b * b - (dx * dx + dy * dy - c.r * c.r); if (q < 0) continue; const sq = Math.sqrt(q); out.push(-b - sq, -b + sq); }
    for (const P of polylines) for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], e = [b[0] - a[0], b[1] - a[1]], den = u[0] * e[1] - u[1] * e[0]; if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - p[0]) * e[1] - (a[1] - p[1]) * e[0]) / den, s = ((a[0] - p[0]) * u[1] - (a[1] - p[1]) * u[0]) / den;
      if (s >= -1e-9 && s <= 1 + 1e-9) out.push(t);
    }
    return out;
  }
  // Extend (or trim) both ends of an open path along its end segments to the nearest crossing with the construction
  // geometry or the other shapes. Straight end segments only. Returns the new shape (unchanged ends where nothing is met).
  function extendEnds(shape, others, cons, trim) {
    if (shape.closed || shape.pts.length < 2) return shape;
    const polys = others.map(o => { const f = filleted(o); return o.closed ? f.concat([f[0]]) : f; });
    const pts = shape.pts.map(p => p.slice());
    const fix = (endI, prevI) => {
      const a = pts[prevI], b = pts[endI]; if (+pts[Math.min(endI, prevI)][3]) return;       // an arc at the end: left as it is
      const L = dist(a, b); if (L < 1e-9) return;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], hits = rayHits([b[0], b[1]], u, cons, polys);
      const t = trim ? Math.max(-Infinity, ...hits.filter(h => h < -1e-6 && h > -L + 1e-6)) : Math.min(Infinity, ...hits.filter(h => h > 1e-6));
      if (isFinite(t)) { b[0] = +(b[0] + u[0] * t).toFixed(5); b[1] = +(b[1] + u[1] * t).toFixed(5); }
    };
    fix(pts.length - 1, pts.length - 2); fix(0, 1);
    return { ...shape, pts };
  }

  // ---- editing one segment or point of a shape. A point is [x, y, fillet R, arc R, open]: the arc R and the open flag
  // belong to the segment from that point to the next. Each returns new shapes; the one passed in is not changed.
  const cp = sh => ({ ...sh, pts: sh.pts.map(p => p.slice()) });
  const segEnd = (sh, j) => (j + 1) % sh.pts.length;
  // segment j: its ends, straight length or arc length, chord angle (degrees), arc radius (0 straight)
  function segInfo(sh, j) {
    const a = sh.pts[j], b = sh.pts[segEnd(sh, j)], r = +a[3] || 0, A = [+a[0], +a[1]], B = [+b[0], +b[1]], chord = dist(A, B);
    const arc = r ? arcSeg(A, B, r) : null;
    return { a: A, b: B, chord, len: arc ? arc.R * Math.abs(arc.sweep) : chord, angle: deg(Math.atan2(B[1] - A[1], B[0] - A[0])), r, tooSmall: !!r && Math.abs(r) < chord / 2 - 1e-9 };
  }
  // Delete segment j: a closed shape opens there (it now starts after the gap and ends before it); an open path
  // splits in two (a piece left with a single point goes). Returns the shapes that replace it (0, 1 or 2).
  function deleteSegment(sh, j) {
    const n = sh.pts.length, P = sh.pts.map(p => p.slice());
    if (sh.closed) {
      const pts = P.slice(j + 1).concat(P.slice(0, j + 1)); const l = pts[pts.length - 1]; l.length = Math.min(l.length, 3);
      pts.forEach(p => { if (p.length > 4) p.length = 4; });                 // open edges are for closed shapes
      return pts.length >= 2 ? [{ ...sh, closed: false, pts }] : [];
    }
    if (j < 0 || j >= n - 1) return [cp(sh)];
    const A = P.slice(0, j + 1), B = P.slice(j + 1); const l = A[A.length - 1]; l.length = Math.min(l.length, 3);
    return [A, B].filter(q => q.length >= 2).map(pts => ({ ...sh, pts }));
  }
  // Split an open path at point j into two paths that share it; a closed shape opens at point j instead
  function splitAt(sh, j) {
    const P = sh.pts.map(p => p.slice());
    if (sh.closed) { const pts = P.slice(j).concat(P.slice(0, j)), f = pts[0].slice(0, 3); pts.push(f); pts.forEach(p => { if (p.length > 4) p.length = 4; }); return [{ ...sh, closed: false, pts }]; }
    if (j <= 0 || j >= P.length - 1) return [cp(sh)];
    const A = P.slice(0, j + 1), B = P.slice(j).map(p => p.slice()); A[A.length - 1] = A[A.length - 1].slice(0, 3);
    return [{ ...sh, pts: A }, { ...sh, pts: B }];
  }
  // a closed shape starting at point j (same outline)
  function startAt(sh, j) { const s = cp(sh); if (sh.closed) s.pts = s.pts.slice(j).concat(s.pts.slice(0, j)); return s; }
  // the same outline run the other way: arcs change sign, and each segment's arc R / open flag moves to its new start
  function reverseShape(sh) {
    const P = sh.pts, n = P.length, out = [];
    for (let k = n - 1; k >= 0; k--) {
      const p = P[k], q = [+p[0], +p[1], +p[2] || 0, 0];
      const seg = sh.closed ? P[(k - 1 + n) % n] : k > 0 ? P[k - 1] : null;   // the segment that now leaves this point
      if (seg) { q[3] = -(+seg[3] || 0) || 0; if (+seg[4]) q[4] = 1; }
      out.push(q);
    }
    if (sh.closed) out.unshift(out.pop());                                    // keep the same first point
    return { ...sh, pts: out };
  }
  // move segment j's end point so the segment is L long (straight) or its chord is (arc), keeping its angle
  function setSegLength(sh, j, L) {
    const s = cp(sh), I = segInfo(sh, j); if (!(L > 0) || I.chord < 1e-12) return s;
    const b = s.pts[segEnd(sh, j)], k = L / I.chord;
    b[0] = +(I.a[0] + (I.b[0] - I.a[0]) * k).toFixed(6); b[1] = +(I.a[1] + (I.b[1] - I.a[1]) * k).toFixed(6);
    return s;
  }
  // turn segment j about its start so its chord runs at ang degrees
  function setSegAngle(sh, j, ang) {
    const s = cp(sh), I = segInfo(sh, j), t = ang * Math.PI / 180, b = s.pts[segEnd(sh, j)];
    b[0] = +(I.a[0] + I.chord * Math.cos(t)).toFixed(6); b[1] = +(I.a[1] + I.chord * Math.sin(t)).toFixed(6);
    return s;
  }
  // insert a point on segment j at its middle (on the arc for an arc; the arc stays one arc of the same radius)
  function insertMid(sh, j) {
    const s = cp(sh), a = s.pts[j], b = s.pts[segEnd(sh, j)], r = +a[3] || 0;
    let m = [(+a[0] + +b[0]) / 2, (+a[1] + +b[1]) / 2];
    if (r) { const A = arcSeg([+a[0], +a[1]], [+b[0], +b[1]], r), t = A.a0 + A.sweep / 2; m = [A.c[0] + A.R * Math.cos(t), A.c[1] + A.R * Math.sin(t)]; }
    const q = [+m[0].toFixed(6), +m[1].toFixed(6), 0, r ? Math.sign(r) * arcSeg([+a[0], +a[1]], [+b[0], +b[1]], r).R : 0];
    if (+a[4]) q[4] = 1;
    if (r) a[3] = q[3];
    s.pts.splice(j + 1, 0, q);
    return s;
  }

  const api = { segInfo, deleteSegment, splitAt, startAt, reverseShape, setSegLength, setSegAngle, insertMid, parsePoint, tangentArc, endDir, rayHits, extendEnds, filletAt, dimensions, dimensionsCSV, measure, area, dist, arcSeg, arcInner, arcThrough, filleted, edgeRuns, segDist, polyLen, at, cumLen, dirAt, removeDup, shapesToText, shapesFromText, consParts, consCrossings, consSnap, mapShapes, moveShapes, rotateShapes, scaleShapes, mirrorShapes, shapesBox, fitPath, parseDXF, dxfShapes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CAD = api;
})(this);

// Toolpath geometry for the HEM toolpaths on shapes the user draws or imports (the drawing geometry is in cad.js): filleted polylines, regions with islands,
// offsets (Clipper, round joins), distances, arc fitting (lines and arcs back from a polyline, as the engraving app
// does) and ASCII DXF import (from the engraving app).
// Inch. Polylines are [[x, y], ...]; closed ones do not repeat the first point. Loops come back with outer
// boundaries counter-clockwise and holes clockwise (y up).
(function (root) {
  'use strict';
  const C = root.ClipperLib || (typeof require !== 'undefined' ? require('./clipper.js') : null);
  if (!C) throw new Error('hem-geo needs lib/clipper.js');
  // the drawing geometry (shapes, arcs, fillets, text, construction, DXF) lives in cad.js; this file adds the
  // toolpath geometry on Clipper and hands out both
  const CAD = root.CAD || (typeof require !== 'undefined' ? require('./cad.js') : null);
  if (!CAD) throw new Error('hem-geo needs lib/cad.js');
  const { area, dist, filleted, segDist, cumLen, at, removeDup } = CAD;
  const S = 1e5;                         // Clipper works in integers: 0.00001 in
  const ARC_TOL = 0.0001;                // how far round joins may stray from the true arc

  const toC = pts => pts.map(p => ({ X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }));
  const fromC = path => path.map(p => [p.X / S, p.Y / S]);

  function union(polys, evenOdd) {
    const c = new C.Clipper(), sol = new C.Paths();
    c.AddPaths(polys.filter(p => p.length >= 3).map(toC), C.PolyType.ptSubject, true);
    const ft = evenOdd ? C.PolyFillType.pftEvenOdd : C.PolyFillType.pftNonZero;
    c.Execute(C.ClipType.ctUnion, sol, ft, ft);
    return sol;
  }
  function offset(paths, d, tol) {
    if (!paths.length) return [];
    const co = new C.ClipperOffset(2, (tol || ARC_TOL) * S), sol = new C.Paths();
    co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    co.Execute(sol, d * S);
    return sol;
  }
  // fewer points: drop ones within d of the line through their neighbours
  function clean(paths, d) { return C.Clipper.CleanPolygons(paths, (d || 0.0002) * S); }
  // boolean of two regions: 'union' | 'diff' | 'and'
  function bool(op, a, b) {
    const c = new C.Clipper(), sol = new C.Paths();
    c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true);
    c.Execute(op === 'diff' ? C.ClipType.ctDifference : op === 'and' ? C.ClipType.ctIntersection : C.ClipType.ctUnion, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    return sol;
  }
  // The parts of a closed loop inside a region, each running the same way as the loop, in order along it.
  function clipLoop(pts, region) {
    const n = pts.length, cum = cumLen(pts, true), path = toC(pts.concat([pts[0]]));
    const c = new C.Clipper(), tree = new C.PolyTree();
    c.AddPath(path, C.PolyType.ptSubject, false); c.AddPaths(region, C.PolyType.ptClip, true);
    c.Execute(C.ClipType.ctIntersection, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    // arc length along the loop of a point on it
    const sAt = p => { let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], d = segDist(p, a, b); if (d < bd) { bd = d; const vx = b[0] - a[0], vy = b[1] - a[1], l = Math.hypot(vx, vy) || 1; best = cum[i] + Math.max(0, Math.min(l, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)); } } return best; };
    const L = cum[cum.length - 1];
    let pieces = C.Clipper.OpenPathsFromPolyTree(tree).map(fromC).filter(P => P.length >= 2).map(P => {
      const s0 = sAt(P[0]), s1 = sAt(P[P.length - 1]), mid = sAt(P[Math.floor(P.length / 2)]);
      const fwd = ((mid - s0 + L) % L) <= ((s1 - s0 + L) % L) + 1e-9;   // the middle comes after the start going forward
      if (!fwd) P = P.slice().reverse();
      return { pts: P, s: fwd ? s0 : s1, e: fwd ? s1 : s0 };
    });
    pieces.sort((a, b) => a.s - b.s);
    // a piece that runs through the loop's start comes back in two halves: join them
    if (pieces.length > 1) { const a = pieces[pieces.length - 1], b = pieces[0]; if (dist(a.pts[a.pts.length - 1], b.pts[0]) < 1e-5) { pieces[0] = { pts: a.pts.concat(b.pts.slice(1)), s: a.s, e: b.e }; pieces.pop(); } }
    // each piece's points, with where it starts and ends along the loop (s0, s1)
    return pieces.map(p => Object.assign(p.pts, { s0: p.s, s1: p.e }));
  }
  // the part of a closed loop from arc length s0 to s1 going forward (round past the start if s1 < s0)
  function loopSlice(pts, s0, s1) {
    const cum = cumLen(pts, true), L = cum[cum.length - 1], n = pts.length, out = [at(pts, true, s0, cum).p];
    let span = ((s1 - s0) % L + L) % L; if (span < 1e-9) return [out[0]];
    for (let i = 1; i <= n; i++) { const s = cum[i % (n + 1)] !== undefined ? cum[i] : L; const d = ((s - s0) % L + L) % L; if (d > 1e-9 && d < span - 1e-9) out.push({ d, p: pts[i % n] }); }
    const mids = out.slice(1).sort((u, v) => u.d - v.d).map(o => o.p);
    return [out[0]].concat(mids, [at(pts, true, s1, cum).p]);
  }
  // One side of an open polyline, d away: side +1 left of its direction, -1 right. Built from Clipper's flat-ended
  // buffer (so tight turns are handled), keeping the run of that buffer on the chosen side, in the path's direction.
  function sideOffset(pts, d, side) {
    const co = new C.ClipperOffset(2, ARC_TOL * S), sol = new C.Paths();
    co.AddPath(toC(pts), C.JoinType.jtRound, C.EndType.etOpenButt); co.Execute(sol, d * S);
    if (!sol.length) return null;
    const loop = fromC(sol.reduce((a, b) => (Math.abs(C.Clipper.Area(b)) > Math.abs(C.Clipper.Area(a)) ? b : a)));
    const cum = cumLen(pts, false), L = cum[cum.length - 1], n = pts.length;
    // for each vertex: which side of the path it is on, and how far along the path its nearest point is
    const info = loop.map(q => {
      let best = Infinity, bi = 0, bt = 0;
      for (let i = 0; i < n - 1; i++) { const a = pts[i], b = pts[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2)) : 0; const dd = Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy); if (dd < best - 1e-12) { best = dd; bi = i; bt = t; } }
      const a = pts[bi], b = pts[bi + 1], cross = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      return { on: Math.sign(cross) === side, s: cum[bi] + bt * (cum[bi + 1] - cum[bi]) };
    });
    // the longest run of vertices on the chosen side, going round the loop
    const m = loop.length; let bestRun = null;
    for (let st = 0; st < m; st++) {
      if (!info[st].on || info[(st - 1 + m) % m].on) continue;
      const run = []; for (let k = 0; k < m && info[(st + k) % m].on; k++) run.push(st + k);
      if (!bestRun || run.length > bestRun.length) bestRun = run;
    }
    if (!bestRun) { if (info.every(i => i.on)) bestRun = loop.map((_, i) => i); else return null; }
    let out = bestRun.map(i => loop[i % m]);
    if (info[bestRun[0] % m].s > info[bestRun[bestRun.length - 1] % m].s) out.reverse();
    return removeDup(out);
  }
  // an open path's own direction at its ends
  function endDirs(pts) {
    const n = pts.length, u = (a, b) => { const l = dist(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    return [u(pts[0], pts[1]), u(pts[n - 2], pts[n - 1])];
  }

  // an open polyline (or a closed one as a line) grown by d on both sides, with round ends
  function buffer(pts, closed, d) {
    const co = new C.ClipperOffset(2, ARC_TOL * S), sol = new C.Paths();
    co.AddPath(toC(pts), C.JoinType.jtRound, closed ? C.EndType.etClosedLine : C.EndType.etOpenRound);
    co.Execute(sol, d * S);
    return sol;
  }
  // Clipper paths -> [{pts, hole}] in inches, outer counter-clockwise, holes clockwise
  function loops(paths) {
    return paths.map(fromC).filter(p => p.length >= 3).map(pts => ({ pts, hole: area(pts) < 0, area: Math.abs(area(pts)) }));
  }
  function inside(p, paths) {             // inside a region with holes (even-odd)
    const q = { X: Math.round(p[0] * S), Y: Math.round(p[1] * S) };
    let k = 0; for (const path of paths) if (C.Clipper.PointInPolygon(q, path) !== 0) k++;
    return k % 2 === 1;
  }
  // distance from a point to the edges of closed loops (arrays of points)
  function edgeDist(p, lps) {
    let m = Infinity;
    for (const L of lps) for (let i = 0, n = L.length; i < n; i++) { const d = segDist(p, L[i], L[(i + 1) % n]); if (d < m) m = d; }
    return m;
  }
  // Shapes offset by d (+ outward / to the left of an open path, − inward / to the right): new shapes, with arcs
  // fitted back as arcs. A closed shape can come back as several (or none, when it shrinks away).
  function offsetShapes(shapes, d) {
    // a polyline fitted to lines and arcs, as points with the arc radius on the point it starts from
    const asPts = P => {
      const prims = CAD.fitPath(P, 0.0002), pts = [[+P[0][0].toFixed(5), +P[0][1].toFixed(5), 0, 0]];
      let cur = P[0];
      for (const pr of prims) {
        if (pr.t === 'A') { const R = Math.hypot(cur[0] - pr.cx, cur[1] - pr.cy); pts[pts.length - 1][3] = +(pr.ccw ? R : -R).toFixed(5); }
        pts.push([+pr.x.toFixed(5), +pr.y.toFixed(5), 0, 0]); cur = [pr.x, pr.y];
      }
      return pts;
    };
    const res = [];
    for (const sh of shapes) {
      if (sh.closed) {
        for (const L of loops(offset(union([CAD.filleted(sh)], false), d)).map(l => l.pts)) {
          const pts = asPts(L.concat([L[0]]));
          if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-4) pts.pop();          // closed: no repeat of the first point
          res.push({ closed: true, pts });
        }
      } else {
        const q = sideOffset(CAD.filleted(sh), Math.abs(d), d >= 0 ? 1 : -1);
        if (q && q.length > 1) res.push({ closed: false, pts: asPts(q) });
      }
    }
    return res;
  }

  const api = Object.assign({}, CAD, { offsetShapes, clean, loopSlice, sideOffset, endDirs, clipLoop, bool, S, toC, fromC, union, offset, buffer, loops, inside, edgeDist, C });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HEMGeo = api;
})(this);

// Engagement: how much of the cutter touches material along a toolpath, from a material-removal simulation on a
// grid (a tool radius is about ten cells). The material is where material(p) is true; the tool sweeps the moves in
// order and before each step the share of the cutter's edge touching material is its engagement angle. Each depth
// level (a 'LEVEL' note) starts again from the full material. Moves that change Z (plunges, helixes) cut but are
// not measured.
//
//   ENGAGE.angles(moves, R, box, material)  -> per move, the largest engagement angle in degrees (0 when not measured)
//   ENGAGE.slowDown(moves, K, angles)        -> lowers the feed of roughing moves whose angle runs over the stepover's
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;
  function sweep(m, from) {
    const a0 = Math.atan2(from.y - m.cy, from.x - m.cx), a1 = Math.atan2(m.y - m.cy, m.x - m.cx);
    let s = ((m.t === 'G3' ? a1 - a0 : a0 - a1) % TAU + TAU) % TAU; if (s < 1e-9) s = TAU; return s;
  }
  function angles(moves, R, box, material, opts) {
    const res = Math.max(0.004, (opts && opts.res) || R / 10);
    const x0 = box[0] - R - res, y0 = box[1] - R - res, nx = Math.max(1, Math.ceil((box[2] - box[0] + 2 * R + 2 * res) / res)), ny = Math.max(1, Math.ceil((box[3] - box[1] + 2 * R + 2 * res) / res));
    if (nx * ny > 4e6) return null;                                   // too big to simulate here
    const start = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (material([x0 + (i + 0.5) * res, y0 + (j + 0.5) * res])) start[j * nx + i] = 1;
    let mat = start.slice();
    const rr = Math.ceil(R / res), disk = [], ring = [];
    for (let dj = -rr - 1; dj <= rr + 1; dj++) for (let di = -rr - 1; di <= rr + 1; di++) {
      const d = Math.hypot(di * res, dj * res);
      if (d <= R) disk.push(dj * nx + di);
      if (d <= R && d > R - 1.5 * res) ring.push([di, dj]);          // the cutter's edge, inside it: only what is really cut
    }
    const cell = (x, y) => [Math.floor((x - x0) / res), Math.floor((y - y0) / res)];
    const angle = (x, y) => { const [ci, cj] = cell(x, y); let n = 0; for (const [di, dj] of ring) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < nx && j < ny && mat[j * nx + i]) n++; } return 360 * n / ring.length; };
    const cut = (x, y) => { const [ci, cj] = cell(x, y); if (ci < rr || cj < rr || ci >= nx - rr || cj >= ny - rr) { for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < nx && j < ny && Math.hypot(di, dj) * res <= R) mat[j * nx + i] = 0; } return; } const k0 = cj * nx + ci; for (const o of disk) mat[k0 + o] = 0; };
    const out = new Float32Array(moves.length);
    let p = null;
    moves.forEach((m, mi) => {
      if (m.t === 'C' && /^LEVEL /.test(m.s)) { mat = start.slice(); return; }
      if (m.x === undefined || isNaN(m.x)) return;
      if (p && !isNaN(p.x) && m.t !== 'G0') {
        const flat = Math.abs(m.z - p.z) < 1e-9, pts = [];
        if (m.t === 'G1') { const L = Math.hypot(m.x - p.x, m.y - p.y), n = Math.max(1, Math.ceil(L / res)); for (let i = 1; i <= n; i++) pts.push([p.x + (m.x - p.x) * i / n, p.y + (m.y - p.y) * i / n]); }
        else { const r = Math.hypot(p.x - m.cx, p.y - m.cy), a0 = Math.atan2(p.y - m.cy, p.x - m.cx), sw = sweep(m, p) * (m.t === 'G3' ? 1 : -1), n = Math.max(1, Math.ceil(Math.abs(sw) * r / res)); for (let i = 1; i <= n; i++) { const a = a0 + sw * i / n; pts.push([m.cx + r * Math.cos(a), m.cy + r * Math.sin(a)]); } }
        let worst = 0;
        for (const q of pts) { if (flat) worst = Math.max(worst, angle(q[0], q[1])); cut(q[0], q[1]); }
        out[mi] = worst;
      } else if (m.t === 'G0' && p && !isNaN(p.x)) { /* rapids cut nothing */ }
      p = m;
    });
    return out;
  }
  // The chip a programmed feed gives grows with the engagement up to 90°: over the stepover's own angle the feed
  // comes down by sin(target) / sin(angle), and past 90° (the tool wrapped in the cut) by a further 90 / angle.
  function slowDown(moves, K, ang, opts) {
    const target = Math.acos(Math.max(-1, Math.min(1, 1 - Math.min(K.ae, K.R) / K.R))) * 180 / Math.PI;
    const floor = (opts && opts.floor) || 0.3, rad = Math.PI / 180;
    let sec = '', n = 0, worst = 0, lowest = 1;
    moves.forEach((m, i) => {
      if (m.t === 'SEC') { sec = m.name; return; }
      if (sec !== 'ROUGH' || !(m.t === 'G1' || m.t === 'G2' || m.t === 'G3') || !m.f) return;
      const a = ang[i]; if (!(a > target * 1.25 + 5)) return;
      const f = Math.max(floor, Math.sin(Math.max(target, 1) * rad) / Math.sin(Math.min(a, 90) * rad) * (a > 90 ? 90 / a : 1));
      if (f > 0.95) return;
      m.f = Math.round(m.f * f * 10) / 10; m.slowed = Math.round(a); n++; worst = Math.max(worst, a); lowest = Math.min(lowest, f);
    });
    return { n, worst, lowest, target };
  }
  const api = { angles, slowDown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ENGAGE = api;
})(this);

// High-efficiency milling (HEM) toolpaths: light radial stepover, full flute depth, constant engagement, climb
// milling, with speeds and feeds worked out from surface speed, chip load and radial chip thinning.
// Three operations, inch:
//   profile  outside of a rectangle (with corner radius) or a circle, from rectangular or even stock
//   pocket   circular pocket: helix down at the centre, spiral out, finish the wall
//   slot     trochoidal slot between two points, open ended or started with a helix
// Every toolpath is a list of moves (G0 / G1 / G2 / G3 with absolute arc centres) that is written out as G-code
// (toGcode) or as a Mazatrol program of MANL PRG units through MACH1 (toMazatrol), laid out the way the engraving
// app writes them: each unit starts with G0 G90 X Y S M3, G0 G17 Z and a G1 G94 Z F, arcs stay G2/G3 with I J,
// and a job too long for one unit carries on in the next over the same point.
(function (root) {
  'use strict';

  const num = (v, d = 0) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const TAU = 2 * Math.PI;

  // ---------------------------------------------------------------- materials
  // The numbers come from the Feeds and Speeds library (lib/feeds.js): solid carbide end mills (surface speed, chip
  // as a fraction of D, unit power), its finish factors and its coatings. Without it, these starting points.
  const Feeds = () => root.FEEDS || (typeof require !== 'undefined' ? (() => { try { return require('./feeds.js'); } catch (e) { return null; } })() : null);
  const LOCAL_MATERIALS = {
    a36:    { name: 'A36 / 1018 mild steel',     sfmR: 500,  sfmF: 450,  k: 0.006,  hp: 1.0 },
    s1045:  { name: '1045 medium carbon steel',  sfmR: 450,  sfmF: 400,  k: 0.0055, hp: 1.1 },
    s4140:  { name: '4140 prehard (~30 HRC)',    sfmR: 350,  sfmF: 320,  k: 0.005,  hp: 1.3 },
    ss304:  { name: '304 / 316 stainless',       sfmR: 350,  sfmF: 300,  k: 0.0045, hp: 1.4 },
    ci:     { name: 'Gray cast iron',            sfmR: 450,  sfmF: 400,  k: 0.006,  hp: 0.6 },
    al6061: { name: '6061 aluminum',             sfmR: 1200, sfmF: 1200, k: 0.009,  hp: 0.3 },
    ti64:   { name: 'Ti-6Al-4V titanium',        sfmR: 200,  sfmF: 180,  k: 0.004,  hp: 1.2 },
  };
  // name -> {name, sfmR, sfmF, k, kF, hp} (k, kF: rough and finish chip per tooth as a fraction of D)
  const MATERIALS = (() => {
    const F = Feeds(); if (!F) { const o = {}; for (const [k, m] of Object.entries(LOCAL_MATERIALS)) o[k] = Object.assign({ kF: 0.003 / 0.75 }, m); return o; }
    const o = {}; for (const [k, m] of Object.entries(F.MATERIALS)) o[k] = { name: m.name, sfmR: m.em.sfm, sfmF: Math.round(m.em.sfm * F.OPS.finish.sfm), k: m.em.k, kF: m.em.k * F.OPS.finish.k, hp: m.hp };
    return o;
  })();
  const COATINGS = (() => { const F = Feeds(); return F ? F.COATINGS : { auto: { name: 'Best for the material', f: { st: 1, ss: 1, ci: 1, al: 1, ti: 1 } } }; })();
  // the numbers for a material, tool diameter and coating (blank fields in the settings use these)
  function matNumbers(c, D) {
    const F = Feeds(), m = MATERIALS[c.mat] || MATERIALS.a36, group = F && F.GROUP[c.mat] || 'st';
    const coat = (COATINGS[c.coating] || COATINGS.auto || { f: {} }).f[group] || 1;
    return { sfmR: Math.round(m.sfmR * coat), sfmF: Math.round(m.sfmF * coat), fzR: +(m.k * D).toFixed(5), fzF: +(m.kF * D).toFixed(5), hp: m.hp, coat };
  }

  const DEFAULTS = {
    op: 'profile',
    // outside profile
    shape: 'rect', partW: '4', partH: '3', cornerR: '0.25', partD: '3', cx: '0', cy: '0',
    // stockType: even = passes around the part, from the stock per side in to the wall (the default);
    // rect = clear a rectangular block, corners and all
    stockType: 'even', stockX: '5', stockY: '4', stockW: '0.5',
    // circular pocket
    pocketD: '3', helixD: '0.375', ramp: '2',
    // trochoidal slot
    x1: '-3', y1: '0', x2: '3', y2: '0', slotW: '1', slotEntry: 'open',
    // depth
    depth: '2.375', apMax: '0',
    // tool
    toolD: '0.75', flutes: '5', loc: '2.5', stick: '2.625', toolNo: '1',
    // cutting data
    // blank = from the material and coating (lib/feeds.js); a number overrides
    mat: 'a36', coating: 'auto', sfmR: '', fzR: '', thin: true, sfmF: '', fzF: '', unitHp: '',
    rpmR: '', feedR: '', rpmF: '', feedF: '',
    // toolpath
    // passes: both (rough + finish) | rough (rough only, cut to size) | finish (finish only, part already roughed)
    passes: 'both',
    // where the passes start: off = automatic; on = each loop starts at its point nearest (entryX, entryY)
    entryOn: false, entryX: '0', entryY: '0',
    ae: '0.06', finish: true, finStock: '0.012', spring: false, dir: 'climb', leadR: '0.25',
    link: 'depth', lift: '0.02', rampPct: '50', airFeed: '50',
    // trochoidal loops: the back half of each loop runs through ground already cut, at this % of the roughing feed
    retPct: '200',
    // lower the feed where the cutter wraps more of the cut than the stepover intends (simulated)
    slowDown: true,
    // machine and output
    maxRpm: '10000', hp: '20', rapid: '1000',
    prog: '1000', wcs: 'G54', cool: 'M8', toolChange: true, home: true, lineNums: false, dec: '4',
    // safeZ: clearance plane (in and out, above clamps); rapidZ: rapid plane (rapid down to it, then feed);
    // retract: between cuts the tool lifts to the rapid plane or all the way to the clearance plane
    safeZ: '1', rapidZ: '0.1', retract: 'rapid', fileName: '',
    // Mazatrol
    // your own shapes: points [x, y, fillet r]; cop: outside | pocket | path
    shapes: [{ closed: true, pts: [[-2, -1.5, 0.25], [2, -1.5, 0.25], [2, 0, 0.25], [0.5, 0, 0.25], [0.5, 1.5, 0.25], [-2, 1.5, 0.25]] }],
    // construction geometry (never machined): {t: 'point', x, y} | {t: 'line', x, y, a} through a point at a|
    // {t: 'line2', x1, y1, x2, y2} through two points | {t: 'circle', x, y, d}
    cons: [],
    cop: 'outside', strategy: 'offset', pocketStrategy: 'auto',
    // open profile: the path is the finished wall; openSide: which side of it (along its direction) the stock is on
    openSide: 'left', openStock: '0.5', openExt: '', openDir: 'oneway',
    // outside profile, offset loops: pieces of loops between stretches of air, zigzag (no lifts) or one way (all climb)
    pieceDir: 'zigzag', stockM: '0.5', smoothR: '0.15', trochD: '0.375', dxfUnits: 'auto',
    mazCtl: 'MatrixM', mazName: '', mazTool: 'END MILL', mazNom: '', mazSuf: 'A', mazMat: 'CBN STL', mazInitZ: '1',
  };

  const OPS = { profile: 'OUTSIDE PROFILE', pocket: 'CIRCULAR POCKET', slot: 'TROCHOIDAL SLOT', custom: 'CUSTOM SHAPE' };

  // ---------------------------------------------------------------- speeds and feeds
  // Radial chip thinning: below half the diameter the chip is thinner than the feed per tooth, so the programmed
  // feed per tooth is raised by D / (2·sqrt(D·ae − ae²)) to keep the real chip at the target.
  function rctf(D, ae) { return ae > 0 && ae < D / 2 ? D / (2 * Math.sqrt(D * ae - ae * ae)) : 1; }

  function calc(c) {
    const D = Math.max(0.001, Math.abs(num(c.toolD, 0.75))), R = D / 2;
    const Z = Math.max(1, Math.round(num(c.flutes, 4)));
    const depth = Math.abs(num(c.depth, 0.5));
    const apMax = Math.abs(num(c.apMax, 0));
    const levels = apMax > 0 && apMax < depth - 1e-9 ? Math.ceil(depth / apMax - 1e-9) : 1;
    const ap = depth / levels;
    const ae = Math.min(D, Math.max(0.001, Math.abs(num(c.ae, 0.1 * D))));
    const maxRpm = Math.max(1, num(c.maxRpm, 10000));
    const thin = c.thin ? rctf(D, ae) : 1;
    const side = (sfm, fz, rpmO, feedO, factor) => {
      const want = sfm * 12 / (Math.PI * D);
      const rpmSet = num(rpmO, 0) > 0 ? Math.round(num(rpmO)) : Math.round(Math.min(want, maxRpm));
      const fzProg = fz * factor;
      const feedSet = num(feedO, 0) > 0 ? num(feedO) : rpmSet * Z * fzProg;
      return { rpm: rpmSet, rpmWant: Math.round(want), clamped: !(num(rpmO, 0) > 0) && want > maxRpm, sfm: rpmSet * Math.PI * D / 12,
        fzProg: feedSet / (rpmSet * Z), fzReal: feedSet / (rpmSet * Z) / factor, feed: Math.round(feedSet * 10) / 10 };
    };
    const auto = matNumbers(c, D), over = v => num(v, 0) > 0 ? num(v, 0) : null;
    const sfmR = over(c.sfmR) || auto.sfmR, sfmF = over(c.sfmF) || auto.sfmF;
    const r = side(sfmR, Math.abs(over(c.fzR) || auto.fzR), c.rpmR, c.feedR, thin);
    const fin = Math.abs(num(c.finStock, 0));
    const f = side(sfmF, Math.abs(over(c.fzF) || auto.fzF), c.rpmF, c.feedF, 1);
    const unitHp = Math.max(0, over(c.unitHp) || auto.hp);
    const mrr = ae * ap * r.feed, hpNeed = mrr * unitHp;
    return {
      D, R, Z, depth, levels, ap, ae, thin, maxRpm, rough: r, fin: f, auto, finStock: c.finish ? fin : 0,
      mrr, hpNeed, hpMachine: Math.max(0, num(c.hp, 0)), unitHp,
      mrrFin: fin * depth * f.feed,
      airFeed: Math.max(0.1, num(c.airFeed, 50)),
      helixFeed: Math.round(r.feed * Math.min(100, Math.max(5, num(c.rampPct, 50)))) / 100,
      retFeed: Math.round(r.feed * Math.min(500, Math.max(100, num(c.retPct, 200))) / 10) / 10,
      safeZ: num(c.safeZ, 1), rapidZ: Math.min(num(c.rapidZ, 0.1), num(c.safeZ, 1)), rapid: Math.max(1, num(c.rapid, 1000)),
      retractZ: c.retract === 'clear' ? num(c.safeZ, 1) : Math.min(num(c.rapidZ, 0.1), num(c.safeZ, 1)),
      loc: Math.abs(num(c.loc, 0)), stick: Math.abs(num(c.stick, 0)), toolNo: Math.max(0, Math.round(num(c.toolNo, 1))),
    };
  }

  // ---------------------------------------------------------------- path builder
  // Moves: {t:'G0'|'G1'|'G2'|'G3', x, y, z, f, k} with arc centre cx, cy; {t:'SEC', name, rpm}; {t:'C', s}.
  // k: rapid, air (feed moves in the clear), entry (helix and lead arcs), rough, link, finish.
  function builder() {
    const m = [];
    let P = { x: NaN, y: NaN, z: NaN };
    const eq = (a, b) => Math.abs(a - b) < 1e-9;
    const B = {
      m,
      pos: () => P,
      note: s => m.push({ t: 'C', s }),
      sec: (name, rpm) => m.push({ t: 'SEC', name, rpm }),
      g0(x, y, z, flag) {
        x = x == null ? P.x : x; y = y == null ? P.y : y; z = z == null ? P.z : z;
        if (eq(x, P.x) && eq(y, P.y) && eq(z, P.z)) return;
        m.push({ t: 'G0', x, y, z, k: 'rapid', flag }); P = { x, y, z };
      },
      g1(x, y, z, f, k) {
        x = x == null ? P.x : x; y = y == null ? P.y : y; z = z == null ? P.z : z;
        if (eq(x, P.x) && eq(y, P.y) && eq(z, P.z)) return;
        m.push({ t: 'G1', x, y, z, f, k }); P = { x, y, z };
      },
      arc(ccw, x, y, cx, cy, z, f, k) {       // 180° or less
        z = z == null ? P.z : z;
        m.push({ t: ccw ? 'G3' : 'G2', x, y, z, cx, cy, f, k }); P = { x, y, z };
      },
      // turn about a centre from where the tool is by sweep radians, in pieces of 180° or less, with Z going
      // evenly to zEnd (a helix when it changes)
      turn(ccw, cx, cy, sweep, zEnd, f, k) {
        const r = Math.hypot(P.x - cx, P.y - cy), a0 = Math.atan2(P.y - cy, P.x - cx), z0 = P.z;
        if (zEnd == null) zEnd = z0;
        const n = Math.max(1, Math.ceil(sweep / Math.PI - 1e-9)), full = Math.abs(sweep / TAU - Math.round(sweep / TAU)) < 1e-9;
        const x0 = P.x, y0 = P.y;
        for (let i = 1; i <= n; i++) {
          const a = a0 + (ccw ? 1 : -1) * sweep * i / n, last = i === n && full;   // whole turns end exactly where they began
          B.arc(ccw, last ? x0 : cx + r * Math.cos(a), last ? y0 : cy + r * Math.sin(a), cx, cy, z0 + (zEnd - z0) * i / n, f, k);
        }
      },
      // moves worked out on another builder, taken over as they are
      append(ms) { for (const mv of ms) { m.push(mv); if (mv.x !== undefined) P = { x: mv.x, y: mv.y, z: mv.z }; } },
      run(prims, z, f, k) {
        for (const p of prims) {
          if (p.t === 'L') B.g1(p.x, p.y, z, f, k);
          else B.arc(p.ccw, p.x, p.y, p.cx, p.cy, z, f, k);
        }
      },
    };
    return B;
  }

  // A rounded rectangle about (cx, cy): half sizes A, B, corner radius rho, clockwise from the middle of the right
  // side. With A = B = rho it is a circle (four quarter arcs).
  function rrLoop(cx, cy, A, B, rho, ccw) {
    rho = Math.max(0, Math.min(rho, A, B));
    const e = 1e-9, sx = A - rho, sy = B - rho, P = [];
    const L = (x, y) => P.push({ t: 'L', x, y }), Ar = (x, y, ax, ay) => P.push({ t: 'A', ccw: false, x, y, cx: ax, cy: ay });
    if (sy > e) L(cx + A, cy - sy);
    if (rho > e) Ar(cx + sx, cy - B, cx + sx, cy - sy);
    if (sx > e) L(cx - sx, cy - B);
    if (rho > e) Ar(cx - A, cy - sy, cx - sx, cy - sy);
    if (sy > e) L(cx - A, cy + sy);
    if (rho > e) Ar(cx - sx, cy + B, cx - sx, cy + sy);
    if (sx > e) L(cx + sx, cy + B);
    if (rho > e) Ar(cx + A, cy + sy, cx + sx, cy + sy);
    if (sy > e) L(cx + A, cy);
    if (!ccw) return P;
    // the same loop counter-clockwise, still starting and ending at (cx + A, cy)
    const pts = [[cx + A, cy]].concat(P.map(p => [p.x, p.y])), out = [];
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i], to = pts[i];
      out.push(p.t === 'L' ? { t: 'L', x: to[0], y: to[1] } : { t: 'A', ccw: true, x: to[0], y: to[1], cx: p.cx, cy: p.cy });
    }
    return out;
  }

  // A loop of lines and arcs (starting at p0) turned to start at its point nearest q: {S, d (direction there), prims}
  function startNear(prims, p0, q) {
    let best = null, from = p0;
    prims.forEach((pr, i) => {
      const a = from, b = [pr.x, pr.y];
      let pt;
      if (pr.t === 'L') {
        const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2)) : 0;
        pt = [a[0] + t * vx, a[1] + t * vy];
      } else {
        const r = Math.hypot(a[0] - pr.cx, a[1] - pr.cy), dir = pr.ccw ? 1 : -1, a0 = Math.atan2(a[1] - pr.cy, a[0] - pr.cx);
        let sw = ((Math.atan2(b[1] - pr.cy, b[0] - pr.cx) - a0) * dir % TAU + TAU) % TAU; if (sw < 1e-9) sw = TAU;
        const rel = ((Math.atan2(q[1] - pr.cy, q[0] - pr.cx) - a0) * dir % TAU + TAU) % TAU;
        pt = rel <= sw ? [pr.cx + r * Math.cos(a0 + dir * rel), pr.cy + r * Math.sin(a0 + dir * rel)] : (Math.hypot(q[0] - a[0], q[1] - a[1]) < Math.hypot(q[0] - b[0], q[1] - b[1]) ? a : b);
      }
      const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
      if (!best || d < best.d - 1e-12) best = { i, pt, d, a };
      from = b;
    });
    const i = best.i, pr = prims[i], S = best.pt, tail = { ...pr }, head = { ...pr, x: S[0], y: S[1] };
    const same = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 1e-9;
    const out = [];
    if (!same(S, [pr.x, pr.y])) out.push(tail);                       // S on to the end of its piece
    out.push(...prims.slice(i + 1), ...prims.slice(0, i));
    if (!same(best.a, S)) out.push(head);                              // the start of its piece up to S
    let d;
    if (pr.t === 'L') { const l = Math.hypot(pr.x - best.a[0], pr.y - best.a[1]) || 1; d = [(pr.x - best.a[0]) / l, (pr.y - best.a[1]) / l]; }
    else { const r = Math.hypot(S[0] - pr.cx, S[1] - pr.cy) || 1, ux = (S[0] - pr.cx) / r, uy = (S[1] - pr.cy) / r; d = pr.ccw ? [-uy, ux] : [uy, -ux]; }
    return { S, d, prims: out };
  }
  // distance from a rounded rectangle's edge (positive outside)
  function rrDist(p, cx, cy, A, Bh, r) {
    r = Math.max(0, Math.min(r, A, Bh));
    const dx = Math.abs(p[0] - cx) - (A - r), dy = Math.abs(p[1] - cy) - (Bh - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  }

  // Conventional milling: the climb path mirrored across the shape's axis of symmetry (the point p0, direction u),
  // which runs every loop the other way round over the same ground.
  function mirror(moves, p0, u) {
    const ref = (x, y) => { const dx = x - p0[0], dy = y - p0[1], d = dx * u[0] + dy * u[1]; return [p0[0] + 2 * d * u[0] - dx, p0[1] + 2 * d * u[1] - dy]; };
    for (const m of moves) {
      if (m.x === undefined || isNaN(m.x)) continue;
      [m.x, m.y] = ref(m.x, m.y);
      if (m.cx !== undefined) { [m.cx, m.cy] = ref(m.cx, m.cy); m.t = m.t === 'G2' ? 'G3' : 'G2'; }
    }
  }

  function levelsZ(K) { const z = []; for (let i = 1; i <= K.levels; i++) z.push(-K.depth * i / K.levels); return z; }

  // between cuts: up to the retract height (rapid plane or clearance plane), across, rapid down to the rapid plane
  function hop(B, K, x, y) {
    B.g0(null, null, Math.max(K.retractZ, B.pos().z));
    B.g0(x, y);
    B.g0(null, null, K.rapidZ);
  }
  // start of the program: over the first point, down to the clearance plane (tool length offset there), then the rapid plane
  function start(B, K, x, y) {
    B.g0(x, y);
    B.g0(null, null, K.safeZ, 'tlo');
    B.g0(null, null, K.rapidZ);
  }

  // to the start of the finish pass: across at depth after roughing, or in from the top for a finish-only program
  // (the part is already roughed there, so it feeds straight down in the clear)
  function approach(B, K, p, z, fr) {
    if (isNaN(B.pos().x)) { start(B, K, p[0], p[1]); B.g1(null, null, z, K.airFeed, 'air'); }
    else B.g1(p[0], p[1], z, fr, 'link');
  }

  // ---------------------------------------------------------------- outside profile
  function genProfile(c, K, B, W, G) {
    const cx = num(c.cx), cy = num(c.cy), R = K.R, a = K.finStock;
    let hx, hy, rc;
    if (c.shape === 'circle') { hx = hy = rc = Math.abs(num(c.partD, 3)) / 2; }
    else { hx = Math.abs(num(c.partW, 4)) / 2; hy = Math.abs(num(c.partH, 3)) / 2; rc = Math.min(Math.abs(num(c.cornerR, 0)), hx, hy); }
    if (!(hx > 0 && hy > 0)) { W.push('Enter the part size.'); return; }
    let A0, B0, r0;
    if (c.stockType === 'rect') { A0 = Math.abs(num(c.stockX, 0)) / 2 + R; B0 = Math.abs(num(c.stockY, 0)) / 2 + R; r0 = R; }
    else { const w = Math.abs(num(c.stockW, 0)); A0 = hx + w + R; B0 = hy + w + R; r0 = rc + w + R; }
    G.part = { t: 'rr', cx, cy, A: hx, B: hy, r: rc };
    G.stock = { t: 'rr', cx, cy, A: A0 - R, B: B0 - R, r: r0 - R };
    const Aa = hx + R + a, Ba = hy + R + a, ra = rc + R + a;
    const dA = A0 - Aa, dB = B0 - Ba;
    if (dA < -1e-9 || dB < -1e-9) W.push('The stock is smaller than the part plus finish stock on ' + (dA < -1e-9 && dB < -1e-9 ? 'both axes' : dA < -1e-9 ? 'X' : 'Y') + '.');
    const N = Math.max(0, Math.ceil(Math.max(dA, dB, 0) / K.ae - 1e-6));
    const rings = [];
    for (let k = 1; k <= N; k++) {
      const t = k / N, A = A0 + (Aa - A0) * t, Bb = B0 + (Ba - B0) * t, rho = Math.min(r0 + (ra - r0) * t, A, Bb);
      rings.push({ A, B: Bb, r: rho });
    }
    const stepX = N ? Math.max(dA, 0) / N : 0, stepY = N ? Math.max(dB, 0) / N : 0, step = Math.max(stepX, stepY);
    // radial engagement where the loop turns a corner: the corner's outermost point moves in by this much per loop
    const dr = N ? (ra - r0) / N : 0, corner = N ? ((stepX + stepY + 2 * dr) / Math.SQRT2 - dr) : 0;
    G.info.push(N ? N + ' roughing loop' + (N === 1 ? '' : 's') + ' per level, stepover ' + fx(stepX) + (Math.abs(stepX - stepY) > 1e-6 ? ' in X, ' + fx(stepY) + ' in Y' : '') +
      ', about ' + fx(corner) + ' at the corners' : 'No roughing: the stock is already at the finish size.');
    if (corner > 1.6 * K.ae && N) W.push('Engagement at the stock corners is about ' + fx(corner) + ' (' + Math.round(corner / K.D * 100) + '% of the tool). Round stock corners, even stock or a smaller stepover bring it down.');
    let Lr = Math.max(0.01, Math.abs(num(c.leadR, 0.25)));
    const need = Math.max(step, a) * 1.05;
    if (Lr < need) { W.push('Lead radius raised to ' + fx(need) + ' so every loop starts in the clear (it must be more than the stepover).'); Lr = need; }
    const zs = levelsZ(K), fr = K.rough.feed, air = K.airFeed, lift = Math.abs(num(c.lift, 0.02));
    let started = false, moved = 0;
    // where each loop starts: the middle of the right side, or the point nearest the chosen entry (the conventional
    // program is this one mirrored, so the entry is mirrored first to land where it was asked for)
    const E = c.entry ? (c.dir === 'conv' ? [c.entry[0], 2 * cy - c.entry[1]] : c.entry) : null;
    const plan = (A, Bh, rho, clear) => {
      const loop = rrLoop(cx, cy, A, Bh, rho), p0 = [cx + A, cy];
      const lead = st => { const nl = [-st.d[1], st.d[0]], C = [st.S[0] + nl[0] * Lr, st.S[1] + nl[1] * Lr]; return { ...st, C, L: [C[0] - st.d[0] * Lr, C[1] - st.d[1] * Lr], E: [C[0] + st.d[0] * Lr, C[1] + st.d[1] * Lr] }; };
      const std = lead({ S: p0, d: [0, -1], prims: loop });
      if (!E) return std;
      const at = lead(startNear(loop, p0, E));
      if (clear(at.L)) return at;
      moved++; return std;
    };
    const emit = (P, z, f, k, twice) => {
      B.arc(true, P.S[0], P.S[1], P.C[0], P.C[1], z, f, k === 'finish' ? 'finish' : 'entry');
      B.run(P.prims, z, f, k); if (twice) B.run(P.prims, z, f, k);
      B.arc(true, P.E[0], P.E[1], P.C[0], P.C[1], z, f, k === 'finish' ? 'finish' : 'entry');
    };
    // the lead-in starts in the clear: outside the stock for the first loop, outside the loop before for the rest
    const plans = rings.map((g, j) => plan(g.A, g.B, g.r, j === 0 ? L => rrDist(L, cx, cy, A0, B0, r0) >= -1e-9 : L => rrDist(L, cx, cy, rings[j - 1].A, rings[j - 1].B, rings[j - 1].r) >= -1e-9));
    if (rings.length && c.rough) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        plans.forEach((P, j) => {
          if (j === 0) {
            if (!started) { start(B, K, P.L[0], P.L[1]); started = true; } else hop(B, K, P.L[0], P.L[1]);
            B.g1(null, null, z, air, 'air');
          } else if (c.link === 'lift') { B.g0(null, null, z + lift); B.g0(P.L[0], P.L[1]); B.g1(null, null, z, air, 'air'); }
          else B.g1(P.L[0], P.L[1], z, fr, 'link');
          emit(P, z, fr, 'rough');
        });
      });
    }
    if (c.finish) {
      const Af = hx + R, Bf = hy + R, rf = rc + R, z = -K.depth;
      const P = plan(Af, Bf, rf, L => rrDist(L, cx, cy, hx + R + a, hy + R + a, rc + R + a) >= -1e-9 || !c.rough);
      B.sec('FINISH', K.fin.rpm);
      if (!started) { start(B, K, P.L[0], P.L[1]); started = true; } else hop(B, K, P.L[0], P.L[1]);
      B.g1(null, null, z, air, 'air');
      emit(P, z, K.fin.feed, 'finish', c.spring);
    }
    if (E && moved) W.push(moved + ' pass' + (moved > 1 ? 'es start' : ' starts') + ' at the middle of the right side instead: at the chosen entry the lead-in would begin on stock.');
    if (started) B.g0(null, null, K.safeZ);
    G.axis = [[cx, cy], [1, 0]];
    G.climbNote = 'Outside profile: climb is clockwise with the spindle in M3.';
  }

  // ---------------------------------------------------------------- circular pocket
  function genPocket(c, K, B, W, G) {
    const cx = num(c.cx), cy = num(c.cy), R = K.R, a = K.finStock, Dp = Math.abs(num(c.pocketD, 3));
    G.part = { t: 'circle', cx, cy, r: Dp / 2, hole: true };
    const Rf = Dp / 2 - R, Ra = Rf - a;
    if (!(Ra > 0.001)) { W.push('The pocket is too small for this tool: it must be larger than the tool diameter plus twice the finish stock.'); return; }
    let rh = Math.abs(num(c.helixD, 0.5 * K.D)) / 2;
    if (rh > Ra) { rh = Ra; W.push('Helix diameter cut to ' + fx(2 * rh) + ' to fit the pocket.'); }
    if (rh < 0.01) { rh = Math.min(Ra, 0.1 * K.D); W.push('Helix diameter raised to ' + fx(2 * rh) + ': a helix needs some diameter.'); }
    const ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180, drop = TAU * rh * Math.tan(ramp);
    G.info.push('Helix Ø' + fx(2 * rh) + ' (bores Ø' + fx(2 * rh + K.D) + ') at ' + fx(ramp * 180 / Math.PI) + '°: ' + fx(drop) + ' down per turn');
    const zs = levelsZ(K), fr = K.rough.feed, hf = K.helixFeed;
    const n = Math.max(0, Math.ceil((Ra - rh) / K.ae - 1e-6)), s = n ? (Ra - rh) / n : 0;
    if (n) G.info.push(n + ' spiral turn' + (n === 1 ? '' : 's') + ' per level at ' + fx(s) + ' stepover');
    if (c.rough) B.sec('ROUGH', K.rough.rpm), start(B, K, cx + rh, cy);
    let zTop = K.rapidZ;
    if (c.rough) zs.forEach((z, li) => {
      B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
      if (li) B.g1(cx + rh, cy, null, fr, 'link');
      const turns = Math.max(1, Math.ceil((zTop - z) / drop - 1e-9));
      B.turn(true, cx, cy, turns * TAU, z, hf, 'entry');
      B.turn(true, cx, cy, TAU, z, hf, 'entry');                          // flat turn to clean the helix floor
      let r = rh;
      for (let i = 0; i < n; i++) {                                       // half circles about two centres: +s a turn
        B.arc(true, cx - r, cy, cx, cy, z, fr, 'rough');
        B.arc(true, cx + r + s, cy, cx + s / 2, cy, z, fr, 'rough');
        r += s;
      }
      if (n) B.turn(true, cx, cy, TAU, z, fr, 'rough');
      zTop = z;
    });
    if (c.finish) {
      const z = -K.depth, Lr = Math.max(a * 1.05, Math.min(Math.abs(num(c.leadR, 0.25)), Rf / 2)), Sx = cx + Rf;
      B.sec('FINISH', K.fin.rpm);
      approach(B, K, [Sx - Lr, cy - Lr], z, fr);
      B.arc(true, Sx, cy, Sx - Lr, cy, z, K.fin.feed, 'finish');
      B.turn(true, cx, cy, TAU, z, K.fin.feed, 'finish');
      if (c.spring) B.turn(true, cx, cy, TAU, z, K.fin.feed, 'finish');
      B.arc(true, Sx - Lr, cy + Lr, Sx - Lr, cy, z, K.fin.feed, 'finish');
    }
    B.g0(null, null, K.safeZ);
    G.axis = [[cx, cy], [1, 0]];
    G.climbNote = 'Pocket: climb is counter-clockwise with the spindle in M3.';
  }

  // ---------------------------------------------------------------- trochoidal slot
  function genSlot(c, K, B, W, G) {
    const P1 = [num(c.x1), num(c.y1)], P2 = [num(c.x2), num(c.y2)], R = K.R, a = K.finStock, Ws = Math.abs(num(c.slotW, 1));
    let L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
    const u = L > 1e-9 ? [(P2[0] - P1[0]) / L, (P2[1] - P1[1]) / L] : [1, 0], nv = [-u[1], u[0]];
    if (L <= 1e-9) L = 0;
    G.part = { t: 'slot', p1: P1, p2: P2, w: Ws };
    const hw = Ws / 2 - R;
    let r = hw - a;
    if (!(r > 0.02 * K.D)) { W.push('The slot must be wider than the tool (plus twice the finish stock) to cut it trochoidally. For a slot the width of the tool, slot it conventionally at a reduced depth.'); return; }
    const n = L ? Math.max(1, Math.ceil(L / K.ae - 1e-6)) : 0, s = n ? L / n : 0;
    r = trochR(r, s || K.ae);                                  // the return half circles reach sqrt(r² + s²/4)
    const at = (k, off) => [P1[0] + k * s * u[0] + off * nv[0], P1[1] + k * s * u[1] + off * nv[1]];
    G.info.push('Loop Ø' + fx(2 * r) + ' (cuts ' + fx(2 * r + K.D) + ' wide), ' + (n + 1) + ' loops at ' + fx(s) + ' apart' + (Ws / K.D < 1.3 ? '. A slot less than about 1.3× the tool is tight for trochoidal milling.' : ''));
    if (Ws / K.D < 1.2) W.push('Slot width is only ' + (Ws / K.D).toFixed(2) + '× the tool diameter: the loops are small and the engagement will run high. A smaller tool suits this slot better.');
    const helix = c.slotEntry === 'helix', ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180, drop = TAU * r * Math.tan(ramp);
    if (helix) G.info.push('Helix entry Ø' + fx(2 * r) + ' at ' + fx(ramp * 180 / Math.PI) + '°: ' + fx(drop) + ' down per turn');
    else G.info.push('Open entry: start (X1, Y1) must be off the part by at least half the slot width plus the tool radius');
    const zs = levelsZ(K), fr = K.rough.feed, air = K.airFeed;
    const B0 = at(0, -r);
    if (c.rough) B.sec('ROUGH', K.rough.rpm);
    let zTop = K.rapidZ;
    if (c.rough) zs.forEach((z, li) => {
      B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
      if (!li) start(B, K, B0[0], B0[1]); else hop(B, K, B0[0], B0[1]);
      if (helix) {
        if (li) B.g1(null, null, zTop, air, 'air');
        const turns = Math.max(1, Math.ceil((zTop - z) / drop - 1e-9));
        const c0 = at(0, 0);
        B.turn(true, c0[0], c0[1], turns * TAU, z, K.helixFeed, 'entry');
        B.turn(true, c0[0], c0[1], TAU, z, K.helixFeed, 'entry');
      } else B.g1(null, null, z, air, 'air');
      for (let k = 0; k <= n; k++) {
        const ck = at(k, 0), Ak = at(k, r);
        B.arc(true, Ak[0], Ak[1], ck[0], ck[1], z, fr, 'rough');           // front half: the cut
        if (k < n) { const Bn = at(k + 1, -r), m = at(k + 0.5, 0); B.arc(true, Bn[0], Bn[1], m[0], m[1], z, K.retFeed, 'link'); }   // back half: the return, over cut ground
        else { const Bk = at(k, -r); B.arc(true, Bk[0], Bk[1], ck[0], ck[1], z, K.retFeed, 'link'); }
      }
      zTop = z;
    });
    if (c.finish) {
      const z = -K.depth, Lr = Math.max(a * 1.05, Math.min(Math.abs(num(c.leadR, 0.25)), hw / 2));
      const M = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2], S = [M[0] - hw * nv[0], M[1] - hw * nv[1]];
      const Lc = [S[0] + Lr * nv[0], S[1] + Lr * nv[1]];
      B.sec('FINISH', K.fin.rpm);
      approach(B, K, [Lc[0] - Lr * u[0], Lc[1] - Lr * u[1]], z, fr);
      B.arc(true, S[0], S[1], Lc[0], Lc[1], z, K.fin.feed, 'finish');
      const e0 = at(n, -hw), e1 = at(n, hw), s1 = at(0, hw), s0 = at(0, -hw), cN = at(n, 0), c0 = at(0, 0);
      const loop = () => {
        B.g1(e0[0], e0[1], z, K.fin.feed, 'finish');
        B.arc(true, e1[0], e1[1], cN[0], cN[1], z, K.fin.feed, 'finish');
        B.g1(s1[0], s1[1], z, K.fin.feed, 'finish');
        B.arc(true, s0[0], s0[1], c0[0], c0[1], z, K.fin.feed, 'finish');
        B.g1(S[0], S[1], z, K.fin.feed, 'finish');
      };
      loop(); if (c.spring) loop();
      B.arc(true, Lc[0] + Lr * u[0], Lc[1] + Lr * u[1], Lc[0], Lc[1], z, K.fin.feed, 'finish');
    }
    B.g0(null, null, K.safeZ);
    G.axis = [P1, u];
    G.climbNote = 'Slot: climb is counter-clockwise loops with the spindle in M3.';
  }

  // ---------------------------------------------------------------- your own shapes
  // Closed shapes (drawn, typed or from a DXF) as an outside profile or a pocket (shapes inside shapes are
  // islands), or any path as a trochoidal groove. Offsets come from Clipper (hem-geo.js); loops are fitted back
  // to lines and arcs. Every move is checked: links at depth only cross ground that is already cut, and leads
  // only start in the clear; otherwise the tool lifts and comes down in the clear.
  const Geo = () => root.HEMGeo || (typeof require !== 'undefined' ? require('./hem-geo.js') : null);
  const CUSTOM_OPS = { outside: 'OUTSIDE PROFILE', open: 'OPEN PROFILE', pocket: 'POCKET', path: 'TROCHOIDAL GROOVE' };

  function genCustom(c, K, B, W, G) {
    const H = Geo();
    // shapes marked CAD only (cut: false) stay in the drawing but are not machined
    const shapes = (Array.isArray(c.shapes) ? c.shapes : []).filter(s => s.cut !== false).map(s => ({ closed: !!s.closed, pts: H.filleted(s) })).filter(s => s.pts.length >= (s.closed ? 3 : 2));
    G.custom = true;
    const x = { c, K, B, W, G, H, R: K.R, a: K.finStock, zs: levelsZ(K), fr: K.rough.feed, ff: K.fin.feed, air: K.airFeed, sg: c.dir === 'conv' ? -1 : 1, tol: 0.0002 };
    const cop = CUSTOM_OPS[c.cop] ? c.cop : 'outside';
    if (!shapes.length && (c.shapes || []).some(sh => sh.cut === false)) { W.push('Every shape is marked CAD only: tick Machine on the ones to cut.'); return; }
    if (cop === 'open') {
      const open = shapes.filter(s => !s.closed);
      if (!open.length) { W.push('Draw an open path along the finished wall (Draw path; double-click or Enter to finish), then pick the side the stock is on.'); return; }
      if (open.length < shapes.length) G.info.push((shapes.length - open.length) + ' closed shape' + (shapes.length - open.length > 1 ? 's are' : ' is') + ' left out: an open profile follows open paths.');
      return customOpen(x, open.map(s => s.pts));
    }
    if (cop === 'path') {
      if (!shapes.length) { W.push('Draw a path for the groove to follow: click points on the preview, double-click to finish.'); return; }
      return customPath(x, shapes);
    }
    const closed = shapes.filter(s => s.closed).map(s => s.pts), open = shapes.length - closed.length;
    if (!closed.length) { W.push('Draw a closed shape: click points on the preview and click the first point again to close it.'); return; }
    if (open) G.info.push(open + ' open path' + (open > 1 ? 's are' : ' is') + ' left out: ' + (cop === 'pocket' ? 'pockets' : 'profiles') + ' use closed shapes.');
    const rawClosed = (Array.isArray(c.shapes) ? c.shapes : []).filter(s => s.cut !== false && s.closed && (s.pts || []).length >= 2);
    if (cop === 'pocket' && rawClosed.some(s => s.pts.some(p => +p[4]))) customPocketOpen(x, rawClosed);
    else if (cop === 'pocket') customPocket(x, closed); else customOutside(x, closed);
  }

  // A closed loop with arcs on and off. pts in travel order; side +1: the cleared side is left of travel, -1 right.
  // ok(L, arcPts) says whether a lead fits there. With near (where the tool is), the loop starts as close to it
  // as a lead fits, so one loop runs into the next without lifting; otherwise on the longest side. Larger lead
  // radii first, down to LrMin.
  function planLoop(H, pts, side, LrWant, LrMin, ok, near) {
    const n = pts.length, sides = [];
    for (let i = 0; i < n; i++) { const len = H.dist(pts[i], pts[(i + 1) % n]); if (len >= 1e-6) sides.push({ i, len }); }
    const radii = []; for (let r = LrWant; r > LrMin * 1.001; r /= 2) radii.push(r); radii.push(LrMin);
    const make = (sd, Lr) => {
      const p = pts[sd.i], q = pts[(sd.i + 1) % n];
      const d = [(q[0] - p[0]) / sd.len, (q[1] - p[1]) / sd.len], mid = sd.len >= 2 * Lr, S = mid ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] : p;
      const nl = [-d[1] * side, d[0] * side], Cc = [S[0] + nl[0] * Lr, S[1] + nl[1] * Lr];
      return { sd, mid, S, Cc, L: [Cc[0] - d[0] * Lr, Cc[1] - d[1] * Lr], E: [Cc[0] + d[0] * Lr, Cc[1] + d[1] * Lr], Lr };
    };
    const fits = P => {
      const aS = Math.atan2(P.S[1] - P.Cc[1], P.S[0] - P.Cc[0]), arc = [];
      for (let k = 0; k <= 8; k++) { const t = Math.PI / 2 * k / 8; for (const a of [aS - side * t, aS + side * t]) arc.push([P.Cc[0] + P.Lr * Math.cos(a), P.Cc[1] + P.Lr * Math.sin(a)]); }
      return ok(P.L, arc);
    };
    let best = null;
    for (const Lr of radii) {
      let cands = sides.map(sd => make(sd, Lr));
      if (near) cands.sort((u, v) => H.dist(u.L, near) - H.dist(v.L, near));
      else cands.sort((u, v) => v.sd.len - u.sd.len);
      const hit = cands.slice(0, near ? 60 : 16).find(fits);
      if (!hit) continue;
      if (!near) { best = hit; break; }
      // nearest start wins; a larger lead only if it is about as near
      if (!best || H.dist(hit.L, near) < H.dist(best.L, near) - 0.5 * Lr) best = hit;
    }
    if (!best) return null;
    const ring = [best.S]; for (let k = 1; k <= n; k++) ring.push(pts[(best.sd.i + k) % n]); if (best.mid) ring.push(best.S);
    return { L: best.L, S: best.S, E: best.E, Cc: best.Cc, Lr: best.Lr, ccw: side > 0, ring };
  }
  function emitLoop(x, P, z, f, k, twice) {
    const { B, H, tol } = x;
    B.arc(P.ccw, P.S[0], P.S[1], P.Cc[0], P.Cc[1], z, f, k === 'finish' ? 'finish' : 'entry');
    const prims = H.fitPath(H.removeDup(P.ring), tol);
    B.run(prims, z, f, k); if (twice) B.run(prims, z, f, k);
    B.arc(P.ccw, P.E[0], P.E[1], P.Cc[0], P.Cc[1], z, f, k === 'finish' ? 'finish' : 'entry');
  }
  const segOk = (a, b, ok) => { const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.01)); for (let i = 0; i <= n; i++) if (!ok([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n])) return false; return true; };
  // come down at p: from where the tool is, lift to the rapid plane, rapid over, feed down in the clear
  function comeDown(x, p, z) {
    const { B, K } = x, P = B.pos();
    if (isNaN(P.x)) start(B, K, p[0], p[1]);
    else hop(B, K, p[0], p[1]);
    B.g1(null, null, z, x.air, 'air');
  }
  // finish loops: loops in climb order already (material on the right); conventional reverses them
  function finishLoops(x, loops, okLead) {
    const { c, K, B, W, sg } = x, z = -K.depth;
    if (!loops.length) return;
    B.sec('FINISH', K.fin.rpm);
    const LrMin = Math.max(0.005, x.a * 1.1);
    for (const lp of loops) {
      const pts = sg > 0 ? lp : lp.slice().reverse();
      const here = B.pos(), near = c.entry || (isNaN(here.x) ? null : [here.x, here.y]);
      const P = planLoop(x.H, pts, sg, Math.max(LrMin, Math.abs(num(c.leadR, 0.25))), LrMin, okLead, near);
      if (!P) { W.push('No room for a lead arc on one finish loop; it was left out. Check that shape.'); continue; }
      comeDown(x, P.L, z);
      emitLoop(x, P, z, x.ff, 'finish', c.spring);
    }
  }

  function customOutside(x, polys) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x;
    const part = H.union(polys, false), partLoops = H.loops(part), outer = partLoops.filter(l => !l.hole).map(l => l.pts);
    const partC = H.union(outer, false);
    G.part = { t: 'polys', loops: partLoops.map(l => l.pts) };
    let stock;
    if (c.stockType === 'rect') {
      const m = Math.abs(num(c.stockM, 0.5)), bx = [Infinity, Infinity, -Infinity, -Infinity];
      outer.forEach(L => L.forEach(p => { bx[0] = Math.min(bx[0], p[0]); bx[1] = Math.min(bx[1], p[1]); bx[2] = Math.max(bx[2], p[0]); bx[3] = Math.max(bx[3], p[1]); }));
      stock = [[bx[0] - m, bx[1] - m], [bx[2] + m, bx[1] - m], [bx[2] + m, bx[3] + m], [bx[0] - m, bx[3] + m]];
      stock = [stock];
    } else stock = H.loops(H.offset(partC, Math.abs(num(c.stockW, 0.5)))).filter(l => !l.hole).map(l => l.pts);
    G.stock = { t: 'polys', loops: stock };
    const stockC = H.union(stock, false);
    // distance from the part (negative inside it)
    const dPart = p => H.inside(p, partC) ? -H.edgeDist(p, outer) : H.edgeDist(p, outer);
    let Hmax = 0;
    for (const L of stock) for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length], n = Math.max(1, Math.ceil(H.dist(p, q) / 0.05)); for (let k = 0; k < n; k++) Hmax = Math.max(Hmax, dPart([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n])); }
    if (!(Hmax > a + 1e-4)) { W.push('The stock is no bigger than the part plus finish stock: nothing to rough.'); }
    const envC = H.offset(stockC, R);                        // the tool touches the stock only with its centre in here
    const inAir = p => !H.inside(p, envC);
    if (!c.rough) { /* finish only */ }
    else if (c.strategy === 'troch') customOutsideTroch(x, partC, outer, stockC, dPart, Hmax, inAir);
    else if (Hmax > a + 1e-4) {
      const J = Math.ceil((Hmax - a) / K.ae - 1e-6), step = (Hmax - a) / J, rho = Math.max(0, num(c.smoothR, 0));
      G.info.push(J + ' offset loops per level at ' + fx(step) + ' stepover' + (rho ? ', inside corners of the roughing loops rounded to R' + fx(rho) : ''));
      const LrMin = step * 1.05, LrWant = Math.max(LrMin, Math.abs(num(c.leadR, 0.25)));
      B.sec('ROUGH', K.rough.rpm);
      const rings = [];
      for (let j = J - 1; j >= 0; j--) {
        const o = R + a + j * step;
        let reg = H.offset(partC, o);
        // inside corners rounded, except the last loop of a rough-only program: that one is the finished size
        if (rho > 0 && !(j === 0 && !c.finish)) reg = H.offset(H.offset(reg, rho), -rho);
        const lps = H.loops(reg).filter(l => !l.hole).map(l => l.pts).filter(L => L.some(p => !inAir(p)));
        rings.push({ o, loops: lps.map(L => sg > 0 ? L.slice().reverse() : L) });
      }
      let lost = 0;
      const envCut = H.offset(stockC, R + 0.002);               // loops are cut only where they come near the stock
      // The work: whole loops (over stock all round) and pieces of loops (over stock between stretches of air).
      const items = [];
      rings.forEach((rg, ri) => rg.loops.forEach(L => {
        if (L.some(p => !H.inside(p, envCut))) H.clipLoop(L, envCut).filter(pc => H.polyLen(pc, false) >= 1e-3).forEach(pc => items.push({ ri, o: rg.o, closed: false, pts: pc.slice(), loop: L, s0: pc.s0, s1: pc.s1 }));
        else items.push({ ri, o: rg.o, closed: true, pts: L, loop: L });
      }));
      const samp = P => { const o = [P[0]]; let acc = 0; for (let i = 1; i < P.length; i++) { acc += H.dist(P[i - 1], P[i]); if (acc >= 0.1) { o.push(P[i]); acc = 0; } } o.push(P[P.length - 1]); return o; };
      items.forEach(it => { it.sp = samp(it.pts); it.box = it.sp.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]); });
      const touches = (u, v, d) => {
        if (u.box[0] - d > v.box[2] || v.box[0] - d > u.box[2] || u.box[1] - d > v.box[3] || v.box[1] - d > u.box[3]) return false;
        for (const p of u.sp) for (const q of v.sp) if (Math.abs(p[0] - q[0]) < d && Math.abs(p[1] - q[1]) < d && H.dist(p, q) < d) return true;
        return false;
      };
      // Each piece waits for the pieces of the next loop out that it borders, so every area of stock is cleared
      // outside-in on its own and the tool finishes one area before crossing to the next.
      const byRing = []; items.forEach(it => (byRing[it.ri] = byRing[it.ri] || []).push(it));
      items.forEach(it => { it.deps = (byRing[it.ri - 1] || []).filter(o => touches(it, o, 2.5 * step + 0.1)); });
      const zig = c.pieceDir !== 'oneway';
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        const done = new Set(); let last = null;
        const hopTime = d => (K.rapidZ - z) / x.air + d / K.rapid + 0.03;          // up, across, down in the clear
        while (done.size < items.length) {
          let avail = items.filter(it => !done.has(it) && it.deps.every(d => done.has(d)));
          if (!avail.length) avail = items.filter(it => !done.has(it));
          const here = B.pos(), cp = !isNaN(here.x) && Math.abs(here.z - z) < 1e-9 ? [here.x, here.y] : null;
          // where each could start: an open piece at its start (or its end, zigzag), a whole loop anywhere
          const entries = it => it.closed ? [{ p: cp ? it.sp.reduce((q, p) => (H.dist(p, cp) < H.dist(q, cp) ? p : q), it.sp[0]) : it.pts[0], back: false }]
            : [{ p: it.pts[0], back: false }].concat(zig ? [{ p: it.pts[it.pts.length - 1], back: true }] : []);
          const cands = [];
          for (const it of avail) for (const e of entries(it)) cands.push({ it, e, d: cp ? H.dist(cp, e.p) : 0 });
          cands.sort((u, v) => u.d - v.d);
          let best = null;
          for (const cd of cands.slice(0, 8)) {
            const { it, e, d } = cd;
            let t = hopTime(d), how = 'hop', gap = null;
            // on round the same loop through the air, going its way
            if (cp && !it.closed && last && !last.closed && last.loop === it.loop && last.back === e.back) {
              gap = e.back ? H.loopSlice(it.loop, it.s1, last.s0).reverse() : H.loopSlice(it.loop, last.s1, it.s0);
              const tg = H.polyLen(gap, false) / fr; if (tg < t) { t = tg; how = 'gap'; }
            }
            // straight across: all in open air, or a short way over ground this loop's outer neighbour has cut
            if (cp && d / fr < t) {
              const ok = q => inAir(q) || (d < 1.0 && dPart(q) >= Math.min(it.o + step - 1e-4, it.o + 0.5 * step) && dPart(q) >= R + a);
              if (segOk(cp, e.p, ok)) { t = d / fr; how = 'straight'; }
            }
            if (!best || t < best.t) best = { it, e, t, how, gap };
          }
          const { it, e } = best;
          if (it.closed) {
            const okLead = (Lp, arc) => (inAir(Lp) || dPart(Lp) >= it.o + step - 1e-4) && arc.every(p => dPart(p) >= it.o - 1e-4);
            const P = planLoop(H, it.pts, sg, LrWant, LrMin, okLead, c.entry || cp);
            if (!P) { lost++; done.add(it); continue; }
            const okL = q => inAir(q) || (dPart(q) >= Math.min(it.o + step - 1e-4, it.o + 0.5 * step) && dPart(q) >= R + a);
            if (cp && H.dist(cp, P.L) < 1.5 && segOk(cp, P.L, okL)) {
              if (c.link === 'lift') { const lift = Math.abs(num(c.lift, 0.02)); B.g0(null, null, z + lift); B.g0(P.L[0], P.L[1]); B.g1(null, null, z, x.air, 'air'); }
              else B.g1(P.L[0], P.L[1], z, fr, 'link');
            } else comeDown(x, P.L, z);
            emitLoop(x, P, z, fr, 'rough');
            it.back = false;
          } else {
            const pts = e.back ? it.pts.slice().reverse() : it.pts;
            if (best.how === 'straight') B.g1(pts[0][0], pts[0][1], z, fr, 'link');
            else if (best.how === 'gap') B.run(H.fitPath(H.removeDup(best.gap), x.tol), z, fr, 'link');
            else comeDown(x, pts[0], z);
            B.run(H.fitPath(H.removeDup(pts), x.tol), z, fr, 'rough');
            it.back = e.back;
          }
          done.add(it); last = it;
        }
      });
      if (lost) W.push(lost / zs.length + ' roughing loop' + (lost / zs.length > 1 ? 's were' : ' was') + ' left out: no room for a lead arc. Try a smaller lead radius or stepover.');
    }
    if (c.finish) finishLoops(x, H.loops(H.offset(partC, R)).filter(l => !l.hole).map(l => l.pts.slice().reverse()),
      (Lp, arc) => dPart(Lp) >= R + a - 1e-4 && arc.every(p => dPart(p) >= R - 1e-4));
    B.g0(null, null, K.safeZ);
  }

  // ---- trochoidal loops along guide paths
  // Loop centres go at every corner of the guide (any turn over 2°) and evenly between, no more than the stepover
  // apart. Each loop is a full circle about its centre (front half cutting, back half in the cut), and the tool
  // steps to the next loop along the edge of the channel. Every move stays within the loop radius of the guide.
  const trochR = (r, s) => r > s ? Math.sqrt(r * r - s * s / 4) - 1e-4 : r * 0.85;
  function loopCentres(H, pts, closed, s) {
    const P = closed ? pts.concat([pts[0]]) : pts.slice(), n = P.length, out = [P[0]];
    const turn = k => { if (k <= 0 || k >= n - 1) return Math.PI; const a = P[k - 1], b = P[k], c = P[k + 1]; const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); };
    let from = 0;
    for (let k = 1; k < n; k++) {
      if (k < n - 1 && turn(k) < 2 * Math.PI / 180) continue;
      const piece = P.slice(from, k + 1), cum = H.cumLen(piece, false), L = cum[cum.length - 1], m = Math.max(1, Math.ceil(L / s - 1e-9));
      for (let i = 1; i < m; i++) out.push(H.at(piece, false, L * i / m, cum).p);
      out.push(P[k]); from = k;
    }
    return out;
  }
  function trochAlong(x, pts, closed, r, s, z, first) {
    const { B, H, sg, fr } = x, C = loopCentres(H, pts, closed, s), ccw = sg > 0, n = C.length;
    let p = null;
    for (let i = 0; i < n; i++) {
      p = C[i];
      const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)], L = H.dist(a, b) || 1;
      const nv = [-(b[1] - a[1]) / L * sg, (b[0] - a[0]) / L * sg];
      const Bi = [p[0] - r * nv[0], p[1] - r * nv[1]], Ai = [p[0] + r * nv[0], p[1] + r * nv[1]];
      if (i === 0 && first) first(p, Bi); else B.g1(Bi[0], Bi[1], z, fr, 'link');
      B.arc(ccw, Ai[0], Ai[1], p[0], p[1], z, fr, 'rough');
      B.arc(ccw, Bi[0], Bi[1], p[0], p[1], z, x.K.retFeed, 'link');                 // the back half, over ground just cut
    }
    return p;
  }
  // guides: [{pts, closed, r?}] in cutting order (r: that guide's own loop radius); allowedFor(rr).test(p): a loop
  // of radius rr about p stays in bounds; air(p): the tool can come straight down at p (else it helixes in)
  function runTroch(x, guides, r, allowedFor, air, open) {
    const { c, K, B, zs, sg, H } = x, s = K.ae;
    const ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180;
    B.sec('ROUGH', K.rough.rpm);
    let bad = 0, skipped = 0;
    zs.forEach((z, li) => {
      B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
      const zAbove = li ? zs[li - 1] : K.rapidZ;
      let pc = null, pr = r;
      const cutAt = [];                                    // loop centres cut so far at this depth
      guides.forEach(g0 => {
        const rr = g0.r || r;
        let pts = g0.pts;
        const ref = pc || c.entry;
        if (ref) {                                          // start the guide at the point nearest the tool (or the chosen entry)
          if (g0.closed) { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = H.dist(p, ref); if (d < bd) { bd = d; bi = i; } }); pts = pts.slice(bi).concat(pts.slice(0, bi)); }
          else if (H.dist(pts[pts.length - 1], ref) < H.dist(pts[0], ref)) pts = pts.slice().reverse();
        }
        const p0 = pts[0];
        const enter = (p, Bp) => {
          if (air(p)) comeDown(x, Bp, z);
          else {
            comeDown(x, Bp, zAbove);
            const drop = TAU * rr * Math.tan(ramp), turns = Math.max(1, Math.ceil((zAbove - z) / drop - 1e-9));
            B.turn(sg > 0, p[0], p[1], turns * TAU, z, K.helixFeed, 'entry');
            B.turn(sg > 0, p[0], p[1], TAU, z, K.helixFeed, 'entry');
          }
        };
        let first = enter;
        const lr = Math.min(rr, pr);
        if (pc && H.dist(pc, p0) <= 1e-6) first = null;
        else if (pc && open && segOk(pc, p0, open)) { B.g1(p0[0], p0[1], z, x.fr, 'link'); first = null; }   // across open air: no loops needed
        else if (pc && segOk(pc, p0, allowedFor(lr).test)) { trochAlong(x, [pc, p0], false, lr, s, z, null); first = null; }
        else if (pc) {
          // come down over ground already cut at this depth and link in from there
          const test = allowedFor(lr).test, near = cutAt.map(q => [H.dist(q, p0), q]).sort((u, v) => u[0] - v[0]).slice(0, 60);
          const hit = near.find(([, q]) => segOk(q, p0, test));
          if (hit) { comeDown(x, hit[1], z); trochAlong(x, [hit[1], p0], false, lr, s, z, null); first = null; }
          else if (g0.rest) { skipped++; return; }        // a small corner loop not worth a helix of its own
          else bad++;
        }
        if (!g0.rest) for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 200))) cutAt.push(pts[i]);
        pc = trochAlong(x, pts, g0.closed, rr, s, z, first); pr = rr;
      });
    });
    if (skipped) x.W.push(skipped / zs.length + ' corner loop' + (skipped / zs.length > 1 ? 's' : '') + ' could not be reached without leaving the cut and ' + (skipped / zs.length > 1 ? 'were' : 'was') + ' left out; the finish pass takes that material.');
    if (bad) x.G.info.push('The tool lifts and comes down again ' + bad / zs.length + ' time' + (bad / zs.length > 1 ? 's' : '') + ' per level where a link would leave the cut.');
  }
  // bounds for loop centres by loop radius, cached: test(p) and the boundary loops (a hair inside) to snap to
  function bounds(make) {
    const memo = {};
    return rr => { const k = rr.toFixed(5); return memo[k] || (memo[k] = make(rr)); };
  }
  // Material the loop paths miss (in corners, and where offsets meet in a cusp): each piece gets a loop of its
  // own, as large as fits, until the bands cover it. cut: the region to clear (Clipper paths).
  function restGuides(x, cut, guides, r, allowedFor) {
    const { H, K, W } = x, reachOf = rr => rr + K.R - 0.0005, bands = [];
    guides.forEach(g => bands.push(...H.buffer(g.pts, g.closed, reachOf(g.r || r))));
    let left = H.bool('diff', cut, H.union(bands.map(H.fromC), false));
    const extra = [], radii = [r, r * 0.6, r * 0.35, r * 0.2, r * 0.1, 0.01, 0.003].filter((v, i, A) => v >= 0.01 - 1e-9 || i >= A.length - 2);
    const nearest = (m, lps) => { let best = null, bd = Infinity; for (const L of lps) for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy, t = l ? Math.max(0, Math.min(1, ((m[0] - a[0]) * vx + (m[1] - a[1]) * vy) / l)) : 0, q = [a[0] + t * vx, a[1] + t * vy], d = H.dist(q, m); if (d < bd) { bd = d; best = q; } } return best; };
    for (let pass = 0; pass < 60 && left.length; pass++) {
      const pieces = H.loops(left).filter(l => !l.hole && l.area > 2e-6);
      if (!pieces.length) break;
      const add = [];
      for (const pc of pieces) {
        const m = pc.pts.reduce((s, p) => [s[0] + p[0] / pc.pts.length, s[1] + p[1] / pc.pts.length], [0, 0]);
        let pick = null, fallback = null;
        for (const rr of radii) {
          const A = allowedFor(rr), cen = A.test(m) ? m : nearest(m, A.loops);
          if (!cen) continue;
          const far = Math.max(...pc.pts.map(p => H.dist(p, cen))), over = far - reachOf(rr);
          if (over <= 0) { pick = { c: cen, rr }; break; }
          if (!fallback || over < fallback.over) fallback = { c: cen, rr, over };
        }
        const g = pick || fallback;
        if (g) add.push({ pts: [g.c], closed: false, r: g.rr, rest: true });
      }
      if (!add.length) break;
      extra.push(...add);
      const nb = []; add.forEach(g => nb.push(...H.buffer([g.pts[0], [g.pts[0][0] + 1e-5, g.pts[0][1]]], false, reachOf(g.r))));
      const before = H.loops(left).reduce((s, l) => s + (l.hole ? -l.area : l.area), 0);
      left = H.bool('diff', left, H.union(nb.map(H.fromC), false));
      const after = H.loops(left).reduce((s, l) => s + (l.hole ? -l.area : l.area), 0);
      if (before - after < 1e-7) break;                    // no progress
    }
    // slivers thinner than 0.006 (2·area/perimeter) are the finish pass's: say nothing about those
    const miss = H.loops(left).filter(l => !l.hole && l.area > 2e-5 && 2 * l.area / H.polyLen(l.pts, true) > 0.006);
    if (miss.length) W.push('Some material between the loop paths is left for the finish pass (' + miss.length + ' spot' + (miss.length > 1 ? 's' : '') + '). A smaller loop diameter or stepover clears it.');
    if (extra.length) x.G.info.push(extra.length + ' extra loop' + (extra.length > 1 ? 's' : '') + ' for corners and material where the loop paths meet');
    // cut them in a sensible order: nearest next
    const out = []; let at = guides.length ? guides[guides.length - 1].pts[0] : [0, 0];
    const todo = extra.slice();
    while (todo.length) { let bi = 0, bd = Infinity; todo.forEach((g, i) => { const d = H.dist(g.pts[0], at); if (d < bd) { bd = d; bi = i; } }); const g = todo.splice(bi, 1)[0]; out.push(g); at = g.pts[0]; }
    return out;
  }

  function customOutsideTroch(x, partC, outer, stockC, dPart, Hmax, inAir) {
    const { c, K, W, G, H, R, a } = x;
    const r0 = Math.max(0.05 * K.D, Math.abs(num(c.trochD, 0.5 * K.D)) / 2), r = r0;
    const cs = 2 * r + 2 * R - 0.1 * K.D, guides = [];
    if (r0 < 1.5 * K.ae) W.push('Trochoid loops this small for the stepover cut unevenly: make the loop diameter at least 3× the stepover.');
    const reach = H.offset(stockC, R + r + 0.002);            // loop centres out here cannot touch the stock
    for (let j = 0; a + j * cs < Hmax; j++) {
      const lps = H.loops(H.offset(partC, R + a + r + 0.001 + j * cs)).filter(l => !l.hole).map(l => l.pts);
      lps.forEach(L => {
        if (!L.some(p => !H.inside(p, reach))) { guides.push({ pts: L, closed: true, j }); return; }
        H.clipLoop(L, reach).filter(pc => H.polyLen(pc, false) > 1e-3).forEach(pc => guides.push({ pts: pc.slice(), closed: false, j }));
      });
    }
    guides.sort((p, q) => q.j - p.j);
    G.info.push(guides.length + ' trochoidal loop paths per level, loops Ø' + fx(2 * r) + ' advancing ' + fx(K.ae) + ', channels ' + fx(cs) + ' apart');
    const allowedFor = bounds(rr => { const k = H.offset(partC, R + a + rr - 1e-4); return { test: p => !H.inside(p, k), loops: H.loops(H.offset(partC, R + a + rr + 0.001)).map(l => l.pts) }; });
    const stockHit = H.offset(stockC, R + r);
    const cut = H.bool('diff', stockC, H.offset(H.offset(partC, R + a + 0.004), -R));
    guides.push(...restGuides(x, cut, guides, r, allowedFor));
    runTroch(x, guides, r, allowedFor, p => !H.inside(p, stockHit), p => !H.inside(p, reach) && allowedFor(r).test(p));
  }

  function customPocket(x, polys, force) {
    const { c, K, W, G, H, R, a, sg } = x;
    const region = H.union(polys, true), rl = H.loops(region);
    G.part = { t: 'polys', loops: rl.map(l => l.pts), pocket: true };
    const T = H.offset(region, -(R + a));
    if (!T.length) { W.push('The pocket is too small for this tool.'); return; }
    const how = force || (c.pocketStrategy === 'offset' || c.pocketStrategy === 'troch' ? c.pocketStrategy : 'auto');
    if (how === 'offset') return customPocketPeel(x, region, T);
    if (how === 'auto') {
      // both ways, on builders of their own; the faster one is kept
      const tries = ['offset', 'troch'].map(way => {
        const y = Object.assign({}, x, { B: builder(), W: [], G: Object.assign({}, G, { info: [] }) });
        if (way === 'offset') customPocketPeel(y, region, T); else customPocket(y, polys, 'troch');
        return { way, y, min: measure(y.B.m, K).minutes };
      });
      const best = tries[0].min <= tries[1].min ? tries[0] : tries[1], other = best === tries[0] ? tries[1] : tries[0];
      x.B.append(best.y.B.m); W.push(...best.y.W); G.info.push(...best.y.G.info);
      G.info.push('Auto: ' + (best.way === 'offset' ? 'offset loops' : 'trochoidal') + ' (' + best.min.toFixed(1) + ' min) is faster here than ' + (other.way === 'offset' ? 'offset loops' : 'trochoidal') + ' (' + other.min.toFixed(1) + ' min)');
      return;
    }
    let r0 = Math.max(0.05 * K.D, Math.abs(num(c.trochD, 0.5 * K.D)) / 2), r = r0, TT = H.offset(T, -r - 0.001);
    while (!TT.length && r0 > 0.05 * K.D) { r0 /= 2; r = r0; TT = H.offset(T, -r - 0.001); }
    if (!TT.length) { W.push('The pocket is too narrow for trochoidal loops with this tool. A smaller tool suits it better.'); return; }
    if (r0 < 1.5 * K.ae) W.push('Trochoid loops this small for the stepover cut unevenly: make the loop diameter at least 3× the stepover, or the stepover smaller.');
    const cs = 2 * r + 2 * R - 0.1 * K.D, levels = [];
    let cur = TT;
    for (let guard = 0; cur.length && guard < 500; guard++) {
      levels.push(H.loops(cur).map(l => l.pts));
      let nx = H.offset(cur, -cs);
      if (!nx.length) nx = H.offset(cur, -cs / 2);
      cur = nx;
    }
    const guides = [];
    levels.reverse().forEach(ls => ls.forEach(L => guides.push({ pts: L, closed: true })));
    G.info.push(guides.length + ' trochoidal loop paths per level from the middle out, loops Ø' + fx(2 * r) + ' advancing ' + fx(K.ae) + ', ' + fx(cs) + ' apart');
    const allowedFor = bounds(rr => { const k = H.offset(T, -rr + 1e-4); return { test: p => H.inside(p, k), loops: H.loops(H.offset(T, -rr - 0.001)).map(l => l.pts) }; });
    if (c.rough) {
      guides.push(...restGuides(x, H.offset(T, R - 0.004), guides, r, allowedFor));
      runTroch(x, guides, r, allowedFor, () => false);
    }
    if (c.finish) {
      const wall = H.loops(H.offset(region, -R)).map(l => l.pts), wallIn = H.offset(region, -R + 1e-4);
      finishLoops(x, wall, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
    }
    x.B.g0(null, null, K.safeZ);
  }


  // Pocket by peeling: offset loops of the tool-centre region, from the middle out, each a stepover further out
  // than the last. Every area starts with a small trochoidal core (loops along its innermost offset), then the
  // loops peel outward with arcs on from the cut side; loops run into each other at depth where the way across is
  // already cut. Engagement stays at the stepover on the straights and falls at the corners.
  function customPocketPeel(x, region, T) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x, s0 = K.ae;
    const regs = [];
    for (let k = 0; k < 4000; k++) { const rg = H.offset(T, -k * s0); if (!rg.length) break; regs.push(rg); }
    const rt = Math.max(0.05 * K.D, Math.abs(num(c.trochD, 0.5 * K.D)) / 2);
    // the plan, the same at every depth: cores and rings, each with the ground already safe for the tool centre
    const plan = [];
    let safe = [];
    const comps = paths => {                     // outer loops with the holes inside them
      const L = H.loops(paths), outs = L.filter(l => !l.hole), holes = L.filter(l => l.hole);
      return outs.map(o => { const oc = [H.toC(o.pts)]; return { outer: o.pts, holes: holes.filter(h => H.inside(h.pts[0], oc)).map(h => h.pts) }; });
    };
    // a thin area's core runs one way along it: split its loop at the two points farthest apart, keep the longer half
    const halfLoop = L => {
      let bi = 0, bj = 0, bd = -1; const n = L.length, st = Math.max(1, Math.floor(n / 150));
      for (let i = 0; i < n; i += st) for (let j = i + 1; j < n; j += st) { const d = H.dist(L[i], L[j]); if (d > bd) { bd = d; bi = i; bj = j; } }
      const A = L.slice(bi, bj + 1), Bh = L.slice(bj).concat(L.slice(0, bi + 1));
      return H.polyLen(A, false) >= H.polyLen(Bh, false) ? A : Bh;
    };
    let cores = 0;
    for (let k = regs.length - 1; k >= 0; k--) {
      const d = k * s0, r = Math.max(0.01, Math.min(rt, d) - 0.001);
      // ground at this offset that no loop has come near yet: a new area, or a new branch of one, gets a core first,
      // however small (the very middle of an area is small)
      const fresh = safe.length ? H.bool('diff', regs[k], H.offset(safe, 1.5 * s0)) : regs[k];
      for (const cp of comps(fresh)) {
        const cpC = [H.toC(cp.outer)].concat(cp.holes.map(H.toC)), area = H.loops(cpC).reduce((t, l) => t + (l.hole ? -l.area : l.area), 0);
        if (area < 1e-7) continue;
        // thin (it vanishes within a stepover or two): one way along it; otherwise around its loops
        const thin = !cp.holes.length && !H.offset(cpC, -1.5 * s0).length;
        const guides = thin ? [{ pts: halfLoop(cp.outer), closed: false }] : [cp.outer].concat(cp.holes).map(L => ({ pts: L, closed: true }));
        plan.push({ t: 'core', guides, r, safe: safe.slice() });
        safe = H.bool('union', safe, H.offset(cpC, 0.9 * r));       // the core leaves the ground around it cut
        cores++;
      }
      // the loops at this offset; ground counts as cut only where a loop (or a core) actually went
      for (const cp of comps(regs[k])) {
        const cpC = [H.toC(cp.outer)].concat(cp.holes.map(H.toC));
        const loops = [cp.outer].concat(cp.holes).filter(L => H.polyLen(L, true) > 2 * s0);
        for (const L of loops) plan.push({ t: 'ring', pts: L, k, safe: safe.slice() });
        if (loops.length || H.bool('diff', cpC, safe).length === 0) safe = H.bool('union', safe, cpC);
      }
    }
    G.info.push(regs.length + ' offset loops from the middle out at ' + fx(s0) + ' stepover, ' + cores + ' trochoidal core' + (cores === 1 ? '' : 's') + ' (loops Ø' + fx(2 * rt) + ') to start from');
    const ringIn = regs.map(rg => H.offset(rg, 1e-4));
    const LrMin = s0 * 1.05, LrWant = Math.max(LrMin, Math.min(Math.abs(num(c.leadR, 0.25)), 2 * s0 + 0.05));
    const ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180;
    let lost = 0;
    if (c.rough) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        const zAbove = li ? zs[li - 1] : K.rapidZ;
        let first = true;
        for (const op of plan) {
          const here = B.pos(), atDepth = !first && !isNaN(here.x) && Math.abs(here.z - z) < 1e-9, pc = atDepth ? [here.x, here.y] : null;
          if (op.t === 'core') {
            const inT = H.offset(T, -op.r + 1e-4), okT = p => H.inside(p, inT);
            op.guides.forEach((g0, gi) => {
              let pts = g0.pts;
              const at = B.pos(), p = !isNaN(at.x) && Math.abs(at.z - z) < 1e-9 ? [at.x, at.y] : null;
              if (p && g0.closed) { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = H.dist(q, p); if (d < bd) { bd = d; bi = i; } }); pts = pts.slice(bi).concat(pts.slice(0, bi)); }
              else if (p && H.dist(pts[pts.length - 1], p) < H.dist(pts[0], p)) pts = pts.slice().reverse();
              const p0 = pts[0];
              let enter = (q, Bp) => {
                comeDown(x, Bp, zAbove);
                const drop = TAU * op.r * Math.tan(ramp), turns = Math.max(1, Math.ceil((zAbove - z) / drop - 1e-9));
                B.turn(sg > 0, q[0], q[1], turns * TAU, z, K.helixFeed, 'entry');
                B.turn(sg > 0, q[0], q[1], TAU, z, K.helixFeed, 'entry');
              };
              if (p && H.dist(p, p0) > 1e-6 && segOk(p, p0, okT)) { trochAlong(x, [p, p0], false, op.r, s0, z, null); enter = null; }
              else if (p && H.dist(p, p0) <= 1e-6) enter = null;
              else if (op.safe.length) {
                // come down over ground already cut at this depth and loop in from there, rather than a helix
                const edge = H.loops(H.offset(op.safe, -0.002)).map(l => l.pts), cand = [];
                for (const L of edge) for (let i = 0; i < L.length; i += Math.max(1, Math.floor(L.length / 200))) cand.push(L[i]);
                cand.sort((u, v) => H.dist(u, p0) - H.dist(v, p0));
                const q = cand.slice(0, 60).find(qq => okT(qq) && segOk(qq, p0, okT));
                if (q) { comeDown(x, q, z); trochAlong(x, [q, p0], false, op.r, s0, z, null); enter = null; }
              }
              trochAlong(x, pts, g0.closed, op.r, s0, z, enter);
            });
          } else {
            const safeIn = H.offset(op.safe, 1e-4), okSafe = p => H.inside(p, safeIn), ring = ringIn[op.k];
            const okLead = (Lp, arc) => okSafe(Lp) && arc.every(p => H.inside(p, ring));
            const pts = sg > 0 ? op.pts : op.pts.slice().reverse();
            const P = planLoop(H, pts, sg, LrWant, LrMin, okLead, c.entry || pc);
            if (P) {
              if (pc && segOk(pc, P.L, okSafe)) B.g1(P.L[0], P.L[1], z, fr, 'link');
              else comeDown(x, P.L, z);
              emitLoop(x, P, z, fr, 'rough');
            } else {
              // no room for an arc: in straight from a point on the cut side, a stepover in from the loop
              const n = pts.length, order = pts.map((q, i) => [pc ? H.dist(q, pc) : 0, i]).sort((u, v) => u[0] - v[0]).slice(0, 80);
              let done = false;
              for (const [, i] of order) {
                const q = pts[i], nx = pts[(i + 1) % n], len = H.dist(q, nx); if (len < 1e-6) continue;
                const nl = [-(nx[1] - q[1]) / len * sg, (nx[0] - q[0]) / len * sg], Q = [q[0] + nl[0] * s0 * 1.05, q[1] + nl[1] * s0 * 1.05];
                if (!okSafe(Q)) continue;
                if (pc && segOk(pc, Q, okSafe)) B.g1(Q[0], Q[1], z, fr, 'link'); else comeDown(x, Q, z);
                B.g1(q[0], q[1], z, fr, 'entry');
                const ring = [q]; for (let k2 = 1; k2 <= n; k2++) ring.push(pts[(i + k2) % n]);
                B.run(H.fitPath(H.removeDup(ring), x.tol), z, fr, 'rough');
                B.g1(Q[0], Q[1], z, fr, 'entry');
                done = true; break;
              }
              if (!done && H.polyLen(pts, true) > 4 * s0) lost++;   // a loop this small sits in ground the core already cleared
            }
          }
          first = false;
        }
      });
    }
    if (lost) W.push(lost / zs.length + ' pocket loop' + (lost / zs.length > 1 ? 's' : '') + ' had no room for a lead arc and were left out; the finish pass takes that material. A smaller stepover helps.');
    if (c.finish) {
      const wall = H.loops(H.offset(region, -R)).map(l => l.pts), wallIn = H.offset(region, -R + 1e-4);
      finishLoops(x, wall, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
    }
    B.g0(null, null, K.safeZ);
  }


  // Open profile: each open path is a finished wall with stock on one side (openSide, looking along the path).
  // Passes run parallel to it at the stepover, from the stock edge in to the wall, at full depth, starting and
  // ending past the path's ends in the clear (extended straight on by openExt). One way: every pass climb, back to
  // the start above the part. Zigzag: every other pass comes back the other way (conventional) without lifting.
  function customOpen(x, paths) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x;
    const Wst = Math.abs(num(c.openStock, 0.5)), side = c.openSide === 'right' ? -1 : 1;
    const ext = String(c.openExt).trim() === '' ? R + 0.1 : Math.abs(num(c.openExt, R + 0.1));
    G.part = { t: 'lines', lines: paths };
    const bands = [];
    paths.forEach(P => { const far = H.sideOffset(P, Wst, side); if (far) bands.push(P.concat(far.slice().reverse())); });
    G.stock = { t: 'polys', loops: bands };
    if (!(Wst > a + 1e-4) && c.rough) W.push('The stock to remove is no more than the finish stock: nothing to rough.');
    const extend = (P, e) => { const [d0, d1] = H.endDirs(P); return [[P[0][0] - d0[0] * e, P[0][1] - d0[1] * e]].concat(P, [[P[P.length - 1][0] + d1[0] * e, P[P.length - 1][1] + d1[1] * e]]); };
    // climb (spindle M3): the wall on the right of travel, which is along the path when the stock is on its left
    const forward = side * sg > 0;
    const passAt = (P, o) => { const q = H.sideOffset(P, o, side); if (!q || q.length < 2) return null; const e = extend(q, ext); return forward ? e : e.slice().reverse(); };
    const N = Math.max(0, Math.ceil((Wst - a) / K.ae - 1e-6)), step = N ? (Wst - a) / N : 0;
    if (c.rough && N) G.info.push(N + ' pass' + (N > 1 ? 'es' : '') + ' per level at ' + fx(step) + ' stepover, ' + (c.openDir === 'zigzag' ? 'zigzag (every other pass conventional, no lifts)' : 'one way, climb, lifting back to the start') + '; passes run ' + fx(ext) + ' past each end');
    G.info.push('Stock on the ' + (side > 0 ? 'left' : 'right') + ' of the path, looking along it from its first point: ' + fx(Wst) + ' to remove');
    G.info.push('Each pass comes down ' + fx(ext) + ' past the start of the path and feeds in from there: the path must run to the edge of the stock (or its ends be in the clear), or the tool comes down on material.');
    const cut = (pass, z, f, k, reverse) => { const q = reverse ? pass.slice().reverse() : pass; B.run(H.fitPath(H.removeDup(q), x.tol), z, f, k); };
    const goStart = (pt, z) => { const P = B.pos(); if (isNaN(P.x)) start(B, K, pt[0], pt[1]); else hop(B, K, pt[0], pt[1]); B.g1(null, null, z, x.air, 'air'); };
    if (c.rough && N) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        paths.forEach(P => {
          let back = false, prevEnd = null;
          for (let j = N - 1; j >= 0; j--) {
            const pass = passAt(P, R + a + j * step); if (!pass) continue;
            const q = back ? pass.slice().reverse() : pass;
            if (c.openDir === 'zigzag' && prevEnd && H.dist(prevEnd, q[0]) < 2 * step + 0.05) B.g1(q[0][0], q[0][1], z, fr, 'link');   // over past the end, in the clear
            else goStart(q[0], z);
            cut(q, z, fr, 'rough');
            prevEnd = q[q.length - 1];
            if (c.openDir === 'zigzag') back = !back;
          }
        });
      });
    }
    if (c.finish) {
      const z = -K.depth;
      B.sec('FINISH', K.fin.rpm);
      paths.forEach(P => {
        const pass = passAt(P, R); if (!pass) return;
        goStart(pass[0], z);
        cut(pass, z, K.fin.feed, 'finish');
        if (c.spring) { hop(B, K, pass[0][0], pass[0][1]); B.g1(null, null, z, x.air, 'air'); cut(pass, z, K.fin.feed, 'finish'); }
      });
    }
    B.g0(null, null, K.safeZ);
  }


  // A pocket with open edges: the area between the walls (edges not marked open) and any islands, open to the air
  // along the edges marked open. It is cut from the open side in: each pass takes one stepover off the front of the
  // material, the front growing a stepover at a time around the islands (never through them), and each pass only
  // where there is material in reach. The tool comes down in the air past the open edges, never on material.
  function customPocketOpen(x, shapes) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x, s0 = K.ae;
    const region = H.union(shapes.map(sh => H.filleted(sh)), true);
    G.part = { t: 'polys', loops: H.loops(region).map(l => l.pts), pocket: true };
    // the air past each open edge: a band on its outer side, wide enough for the tool to come down and run past
    const bands = [], walls = [], opens = [];
    for (const sh of shapes) {
      const ccw = H.area(H.filleted(sh)) > 0, runs = H.edgeRuns(sh);
      runs.walls.forEach(w => walls.push(w));
      runs.open.forEach(o => { opens.push(o); const far = H.sideOffset(o, 2 * R + 0.2, ccw ? -1 : 1); if (far && far.length > 1) bands.push(o.concat(far.slice().reverse())); });
    }
    G.open = opens;
    const air = H.union(bands, false), whole = H.bool('union', region, air);
    G.air = { t: 'polys', loops: H.loops(air).map(l => l.pts) };
    const T = H.offset(whole, -(R + a)), Tn = H.offset(T, 1e-4);                 // where the tool centre may go
    const M = H.bool('union', H.offset(whole, -a), air);                         // what may be cut: all but the finish stock
    if (!T.length) { W.push('The area is too small for this tool.'); return; }
    // the fronts: cleared ground growing a stepover at a time from the air, only through what may be cut
    // (the front already lies in M, so growing it and keeping what is in M is the new front; its points are kept
    // few, to 0.0005, since the passes follow it and the walls come from M itself)
    const fronts = [air];
    let F = air, area = t => H.loops(t).reduce((q, l) => q + (l.hole ? -l.area : l.area), 0), last = area(F);
    for (let j = 0; j < 3000; j++) {
      const nf = H.clean(H.bool('and', H.offset(F, s0, 0.0005), M), 0.0002), na = area(nf);
      if (na - last < 1e-6) break;
      fronts.push(nf); F = nf; last = na;
    }
    // what is left, less hairline slivers where the front (kept to 0.0005) meets the exact boundary
    const unslivered = t => H.offset(H.offset(t, -0.002, 0.0005), 0.002, 0.0005);
    const left = H.loops(unslivered(H.bool('diff', M, F))).filter(l => !l.hole && l.area > 1e-4);
    if (left.length) W.push(left.length + ' area' + (left.length > 1 ? 's' : '') + ' cannot be reached from the open side and ' + (left.length > 1 ? 'are' : 'is') + ' left: give ' + (left.length > 1 ? 'them' : 'it') + ' an open edge, or cut ' + (left.length > 1 ? 'them' : 'it') + ' as a pocket.');
    // each pass: the tool centre a radius inside the new front, only where there was material within reach
    const passes = [];
    for (let j = 1; j < fronts.length; j++) {
      const rem = unslivered(H.bool('diff', M, fronts[j - 1])), near = H.bool('and', Tn, H.offset(rem, R + 0.001, 0.0005));
      const pcs = [];
      for (const L of H.loops(H.offset(fronts[j], -R, 0.0002)).map(l => l.pts)) {
        const P = sg > 0 ? L : L.slice().reverse();
        if (!P.some(p => !H.inside(p, near))) pcs.push({ pts: P.concat([P[0]]), j });
        else H.clipLoop(P, near).filter(pc => H.polyLen(pc, false) > 1e-3).forEach(pc => pcs.push({ pts: pc.slice(), j }));
      }
      passes.push(pcs);
    }
    G.info.push(passes.length + ' passes from the open side in at ' + fx(s0) + ' stepover' + (c.pieceDir === 'oneway' ? ', one way (all climb)' : ', zigzag (every other pass back conventional)'));
    const zig = c.pieceDir !== 'oneway';
    // coming down: in the air or on cut ground; a pass that starts against material steps in from the nearest cut spot
    const safes = fronts.map(Fr => H.offset(Fr, -R + 1e-4, 0.0005)), edges = [];
    const edgeOf = j => edges[j] || (edges[j] = H.loops(H.offset(fronts[j], -R - 0.002, 0.0005)).map(l => l.pts));
    const downAt = (p, j, z) => {
      if (H.inside(p, safes[j - 1])) { comeDown(x, p, z); return; }
      let best = null, bd = Infinity;
      for (const L of edgeOf(j - 1)) for (const q of L) { const d = H.dist(q, p); if (d < bd) { bd = d; best = q; } }
      if (best) { comeDown(x, best, z); B.g1(p[0], p[1], z, fr, 'entry'); } else comeDown(x, p, z);
    };
    // From the end of one piece to the start of the next without lifting: along the edge of the ground cut before
    // this pass (a hair inside it), the shorter way round, when that is quicker than lifting over. The steps on and
    // off that edge are short and over ground this pass has just cut, or into the front (a stepover at most).
    const hopTime = (d, z) => (K.rapidZ - z) / x.air + d / K.rapid + 0.008;
    const roundCut = (from, to, j, z) => {
      const E = edgeOf(j - 1); if (!E.length) return false;
      let best = null;
      for (const L of E) {
        let ia = -1, da = Infinity, ib = -1, db = Infinity;
        L.forEach((q, i) => { const d1 = H.dist(q, from), d2 = H.dist(q, to); if (d1 < da) { da = d1; ia = i; } if (d2 < db) { db = d2; ib = i; } });
        if (da > 2 * s0 + 0.05 || db > 2 * s0 + 0.05) continue;
        const cum = H.cumLen(L, true), Ln = cum[cum.length - 1], s1 = cum[ia], s2 = cum[ib];
        const fwd = ((s2 - s1) % Ln + Ln) % Ln, back = Ln - fwd;
        const path = fwd <= back ? H.loopSlice(L, s1, s2) : H.loopSlice(L, s2, s1).reverse();
        const len = Math.min(fwd, back) + da + db;
        if (!best || len < best.len) best = { path, len };
      }
      if (!best || best.len / fr > hopTime(H.dist(from, to), z)) return false;
      B.g1(best.path[0][0], best.path[0][1], z, fr, 'link');
      B.run(H.fitPath(H.removeDup(best.path), x.tol), z, fr, 'link');
      B.g1(to[0], to[1], z, fr, 'link');
      return true;
    };
    if (c.rough) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        passes.forEach((pcs, pi) => {
          const j = pi + 1, okLink = p => H.inside(p, safes[j]);          // across ground cut by this pass or before
          const todo = pcs.slice();
          while (todo.length) {
            const here = B.pos(), cp = !isNaN(here.x) && Math.abs(here.z - z) < 1e-9 ? [here.x, here.y] : null;
            let bi = 0, back = false, bd = Infinity;
            todo.forEach((pc, i) => { const P = pc.pts; for (const [e, bk] of [[P[0], false]].concat(zig ? [[P[P.length - 1], true]] : [])) { const d = cp ? H.dist(cp, e) : 0; if (d < bd) { bd = d; bi = i; back = bk; } } });
            const pc = todo.splice(bi, 1)[0], P = back ? pc.pts.slice().reverse() : pc.pts;
            if (cp && segOk(cp, P[0], okLink)) B.g1(P[0][0], P[0][1], z, fr, 'link');
            else if (!(cp && roundCut(cp, P[0], j, z))) downAt(P[0], j, z);
            B.run(H.fitPath(H.removeDup(P), x.tol), z, fr, 'rough');
          }
        });
      });
    }
    if (c.finish) {
      // the walls and islands, a tool radius off: whole loops round islands, pieces along the walls (in from the air)
      const wallNear = H.union(walls.map(w => H.fromC(H.buffer(w, false, R + a + 0.05)[0] || [])).filter(p => p.length > 2), false);
      const loops = H.loops(H.offset(whole, -R)).map(l => l.pts), closedL = [], pieces = [];
      for (const L of loops) {
        if (!L.some(p => !H.inside(p, wallNear))) closedL.push(L);
        else H.clipLoop(L, wallNear).filter(pc => H.polyLen(pc, false) > 1e-3).forEach(pc => pieces.push(pc.slice()));
      }
      const wallIn = H.offset(whole, -R + 1e-4);
      finishLoops(x, closedL, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
      if (pieces.length) {
        if (!closedL.length) B.sec('FINISH', K.fin.rpm);
        const z = -K.depth;
        for (const pc of pieces) {
          const P = sg > 0 ? pc : pc.slice().reverse();
          comeDown(x, P[0], z);
          B.run(H.fitPath(H.removeDup(P), x.tol), z, K.fin.feed, 'finish');
          if (c.spring) { comeDown(x, P[0], z); B.run(H.fitPath(H.removeDup(P), x.tol), z, K.fin.feed, 'finish'); }
        }
      }
    }
    B.g0(null, null, K.safeZ);
  }

  function customPath(x, shapes) {
    const { c, K, W, G, H, R, a } = x, Ws = Math.abs(num(c.slotW, 1));
    const hw = Ws / 2 - R, r0 = hw - a;
    const regionLoops = [];
    shapes.forEach(s => H.loops(H.buffer(s.pts, s.closed, Ws / 2)).forEach(l => regionLoops.push(l.pts)));
    G.part = { t: 'polys', loops: regionLoops, pocket: true };
    if (!(r0 > 0.02 * K.D)) { W.push('The groove must be wider than the tool plus twice the finish stock to cut it trochoidally.'); return; }
    const r = r0 - 1e-4;
    G.info.push('Loops Ø' + fx(2 * r) + ' (cut ' + fx(2 * r + K.D) + ' wide) advancing ' + fx(K.ae) + '; ' + (c.slotEntry === 'helix' ? 'helix entry' : 'open entry: start each path off the part'));
    if (c.rough) runTroch(x, shapes.map(s => ({ pts: s.pts, closed: s.closed })), r, () => ({ test: () => false }), () => c.slotEntry !== 'helix');
    if (c.finish) {
      shapes.forEach(s => {
        const walls = H.loops(H.buffer(s.pts, s.closed, hw)).map(l => l.pts), T = H.buffer(s.pts, s.closed, hw - a + 1e-4), wallIn = H.buffer(s.pts, s.closed, hw + 1e-4);
        finishLoops(x, walls, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
      });
    }
    x.B.g0(null, null, K.safeZ);
  }

  const fx = v => { let s = (+v).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); if (s === '-0') s = '0'; return s; };

  // the material the roughing cuts, for the engagement check: stock less part for outside profiles, the inside for
  // pockets, slots and grooves, the stock band for open profiles
  const Engage = () => root.ENGAGE || (typeof require !== 'undefined' ? require('./engage.js') : null);
  function materialOf(G, K) {
    const H = Geo(), g = G.part, st = G.stock;
    const test = d => {
      if (!d) return null;
      if (d.t === 'rr') return p => rrDist(p, d.cx, d.cy, d.A, d.B, d.r) <= 0;
      if (d.t === 'circle') return p => Math.hypot(p[0] - d.cx, p[1] - d.cy) <= d.r;
      if (d.t === 'slot') return p => { const a = d.p1, b = d.p2, vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy) <= d.w / 2; };
      if (d.t === 'polys') { const P = H.union(d.loops, true); return p => H.inside(p, P); }
      return null;
    };
    if (!g) return null;
    if (st) { const inS = test(st); if (!inS) return null; if (g.t === 'lines') return inS; const inP = test(g); return inP ? p => inS(p) && !inP(p) : inS; }
    return test(g);
  }

  // ---------------------------------------------------------------- generate
  function generate(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    // passes, with settings saved before it existed read from the finish box
    if (!['both', 'rough', 'finish'].includes(c.passes)) c.passes = c.finish === false ? 'rough' : 'both';
    if (cfg && cfg.passes === undefined && cfg.finish === false) c.passes = 'rough';
    c.finish = c.passes !== 'rough'; c.rough = c.passes !== 'finish';
    c.entry = c.entryOn && isFinite(parseFloat(c.entryX)) && isFinite(parseFloat(c.entryY)) ? [parseFloat(c.entryX), parseFloat(c.entryY)] : null;
    const K = calc(c), B = builder(), W = [], G = { info: [] };
    if (c.op === 'custom') genCustom(c, K, B, W, G);
    else if (c.op === 'pocket') genPocket(c, K, B, W, G);
    else if (c.op === 'slot') genSlot(c, K, B, W, G);
    else genProfile(c, K, B, W, G);
    if (c.dir === 'conv' && G.axis && c.op !== 'custom') mirror(B.m, G.axis[0], G.axis[1]);
    checks(c, K, W);
    let stats = measure(B.m, K);
    if (c.slowDown !== false && c.rough) {
      const E = Engage(), mat = materialOf(G, K);
      if (E && mat && B.m.some(m => m.t === 'G1' || m.t === 'G2' || m.t === 'G3')) {
        const ang = E.angles(B.m, K.R, stats.box, mat);
        if (ang) {
          const sd = E.slowDown(B.m, K, ang);
          if (sd.n) { G.info.push('Feed lowered on ' + sd.n + ' move' + (sd.n > 1 ? 's' : '') + ' where the cutter wraps up to ' + Math.round(sd.worst) + '° of the cut (the stepover gives ' + Math.round(sd.target) + '°), down to ' + Math.round(sd.lowest * 100) + '% of the feed'); stats = measure(B.m, K); }
          G.engage = { worst: ang.reduce((a, b) => Math.max(a, b), 0), target: sd.target, slowed: sd.n };
        } else G.info.push('Too large to check the engagement along the toolpath; feeds are not lowered in corners.');
      }
    }
    return { cfg: c, K, moves: B.m, warn: W, geo: G, stats };
  }

  function checks(c, K, W) {
    const finDepth = c.finish ? K.depth : 0;
    if (c.rough && K.loc > 0 && K.ap > K.loc + 1e-9) W.push('Each roughing level cuts ' + fx(K.ap) + ' deep but the flutes are only ' + fx(K.loc) + ' long. Set Max depth per level to ' + fx(K.loc) + ' or less, or use a longer tool.');
    else if (K.loc > 0 && finDepth > K.loc + 1e-9) W.push('The finish pass is ' + fx(finDepth) + ' deep, more than the ' + fx(K.loc) + ' flute length.');
    if (K.stick > 0 && K.stick < K.depth + 0.05) W.push('Stick-out ' + fx(K.stick) + ' is not enough to reach ' + fx(K.depth) + ' deep: the holder would hit the part.');
    if (K.stick > 0 && K.stick / K.D > 4) W.push('Stick-out is ' + (K.stick / K.D).toFixed(1) + '× the tool diameter: expect deflection and chatter. Shorten it, or cut speeds 20–30%.');
    if (c.rough && K.rough.clamped) W.push('Roughing speed wants ' + K.rough.rpmWant + ' RPM but the spindle tops out at ' + K.maxRpm + '; it runs at ' + Math.round(K.rough.sfm) + ' SFM.');
    if (c.finish && K.fin.clamped) W.push('Finishing speed wants ' + K.fin.rpmWant + ' RPM, limited to ' + K.maxRpm + '.');
    if (c.rough && K.hpMachine > 0 && K.hpNeed > 0.8 * K.hpMachine) W.push('Roughing needs about ' + K.hpNeed.toFixed(1) + ' hp at the spindle, ' + Math.round(K.hpNeed / K.hpMachine * 100) + '% of the machine\'s ' + K.hpMachine + ' hp. Lower the stepover.');
    if (c.rough && K.ae > 0.3 * K.D) W.push('A stepover of ' + Math.round(K.ae / K.D * 100) + '% of the tool is heavy for full-depth HEM; 5–15% is typical.');
    if (c.rough && K.thin > 3) W.push('Chip thinning raises the feed ' + K.thin.toFixed(1) + '× at this light stepover. Check the programmed chip load (' + K.rough.fzProg.toFixed(4) + ') against the tool maker\'s maximum.');
    if (num(c.rapidZ, 0.1) > num(c.safeZ, 1)) W.push('The rapid plane (' + fx(num(c.rapidZ)) + ') is above the clearance plane (' + fx(num(c.safeZ)) + '): the program rapids down only to the clearance plane.');
    if (!(K.rapidZ > 0)) W.push('The rapid plane is at or below the top of the part (Z0): the tool would rapid into the stock. Set it above zero, e.g. 0.1.');
    if (!(K.safeZ > 0)) W.push('The clearance plane is at or below the top of the part (Z0). Set it above your clamps and fixtures.');
    const F = Feeds();
    if (F && c.coating && c.coating !== 'auto') { try { F.calc({ tool: 'endmill', mat: c.mat, coating: c.coating, D: K.D, toolMat: 'carbide' }).warnings.filter(w => /coating|sticks|heat breaks|HSS-era/i.test(w)).forEach(w => W.push(w)); } catch (e) { } }
    if (!c.rough && !(K.finStock > 0)) W.push('Finish only with no finish stock: the pass would cut nothing. Enter what roughing left on the wall.');
  }

  // ---------------------------------------------------------------- lengths and time
  function arcSweep(m, from) {
    const a0 = Math.atan2(from.y - m.cy, from.x - m.cx), a1 = Math.atan2(m.y - m.cy, m.x - m.cx);
    let s = m.t === 'G3' ? a1 - a0 : a0 - a1;
    s = ((s % TAU) + TAU) % TAU;
    if (s < 1e-9) s = TAU;
    return s;
  }
  function measure(moves, K) {
    let p = null, feedLen = 0, rapidLen = 0, time = 0;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = (x, y) => { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); };
    for (const m of moves) {
      if (m.x === undefined) continue;
      if (p && !isNaN(p.x)) {
        let d;
        if (m.t === 'G2' || m.t === 'G3') {
          const r = Math.hypot(p.x - m.cx, p.y - m.cy), sw = arcSweep(m, p), a0 = Math.atan2(p.y - m.cy, p.x - m.cx), dir = m.t === 'G3' ? 1 : -1;
          d = Math.hypot(r * sw, m.z - p.z);
          // the arc's own extent: its ends (grown below) and the quadrant points it passes
          for (let q = 0; q < 4; q++) { const t = q * Math.PI / 2, rel = (((t - a0) * dir) % TAU + TAU) % TAU; if (rel <= sw + 1e-12) grow(m.cx + r * Math.cos(t), m.cy + r * Math.sin(t)); }
        }
        else d = Math.hypot(m.x - p.x, m.y - p.y, isNaN(p.z) || isNaN(m.z) ? 0 : m.z - p.z);
        if (m.t === 'G0') { rapidLen += d; time += d / K.rapid; } else { feedLen += d; time += d / m.f; }
      }
      if (!isNaN(m.x)) grow(m.x, m.y);
      p = m;
    }
    return { feedLen, rapidLen, minutes: time, box };
  }

  // ---------------------------------------------------------------- output helpers
  const numFmt = dec => v => { const s = (+v).toFixed(dec).replace(/0+$/, ''); return s === '-0.' ? '0.' : s; };
  const feedFmt = v => String(Math.round(v * 10) / 10);
  // Arc centre from the rounded end points: moved onto the bisector of the rounded chord, so the start and end
  // radii agree at the output resolution and the control does not alarm.
  function arcCentre(S, E, C) {
    const vx = E[0] - S[0], vy = E[1] - S[1], L = Math.hypot(vx, vy);
    if (L < 1e-7) return C;
    const mx = (S[0] + E[0]) / 2, my = (S[1] + E[1]) / 2, nx = -vy / L, ny = vx / L, h = (C[0] - mx) * nx + (C[1] - my) * ny;
    return [mx + h * nx, my + h * ny];
  }
  const clean = s => String(s).replace(/[()]/g, '').replace(/[^\x20-\x7E]/g, '').toUpperCase();
  function fileBase(c) {
    let b = String(c.fileName || '').trim().replace(/\.(nc|ngc|tap|txt|eia|pbd|pbm)$/i, '').replace(/[\\/:*?"<>|\x00-\x1F]+/g, '-').trim();
    if (!b) {
      const K = calc(c);
      b = c.op === 'custom' ? 'hem-' + (CUSTOM_OPS[c.cop] ? c.cop : 'outside') + '-shape' : c.op === 'pocket' ? 'hem-pocket-' + fx(num(c.pocketD)) : c.op === 'slot' ? 'hem-slot-' + fx(num(c.slotW)) + 'w' :
        'hem-profile-' + (c.shape === 'circle' ? fx(num(c.partD)) + 'dia' : fx(num(c.partW)) + 'x' + fx(num(c.partH)));
      b += '-' + fx(K.depth) + 'deep' + (c.passes === 'finish' ? '-finish' : c.passes === 'rough' || c.finish === false ? '-rough' : '-rough-finish');
    }
    return b;
  }
  // Mazatrol names hold 31 characters. A name made from the settings is shortened so its end (which passes: -RF
  // rough + finish, -R rough only, -F finish only) survives; a name that was typed in is only cut.
  function mazName(c) {
    const typed = String(c.mazName || '').trim() || String(c.fileName || '').trim();
    const clean = b => b.toUpperCase().replace(/\.(PBD|PBM|NC)$/, '').replace(/[^A-Z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
    let b = clean(typed || fileBase(c));
    if (!typed && b.length > 31) {
      b = b.replace(/^HEM-/, '').replace(/-ROUGH-FINISH$/, '-RF').replace(/-ROUGH$/, '-R').replace(/-FINISH$/, '-F').replace(/DEEP(?=-|$)/, 'D')
        .replace(/(^|-)PROFILE-/, '$1PROF-').replace(/(^|-)(OUTSIDE|POCKET|OPEN)-SHAPE/, '$1$2').replace(/(^|-)PATH-SHAPE/, '$1GROOVE');
      if (b.length > 31) { const tail = (b.match(/-(RF|R|F)$/) || [''])[0]; b = b.slice(0, 31 - tail.length).replace(/[-_]+$/, '') + tail; }
    }
    return b.slice(0, 31) || 'HEM';
  }
  function coolM(c) { const m = /M?\s*(\d+)/i.exec(String(c.cool || '')); return m ? +m[1] : null; }

  function describeLines(r) {
    const c = r.cfg, K = r.K, f = fx;
    const L = ['HEM ' + OPS[c.op] + ' ' + (c.dir === 'conv' ? 'CONVENTIONAL' : 'CLIMB')];
    if (c.op === 'profile') L.push('PART ' + (c.shape === 'circle' ? 'DIA ' + f(num(c.partD)) : f(num(c.partW)) + ' X ' + f(num(c.partH)) + ' CORNER R' + f(num(c.cornerR))) + ' CENTER X' + f(num(c.cx)) + ' Y' + f(num(c.cy)),
      'STOCK ' + (c.stockType === 'rect' ? f(num(c.stockX)) + ' X ' + f(num(c.stockY)) : f(num(c.stockW)) + ' PER SIDE'));
    if (c.op === 'pocket') L.push('POCKET DIA ' + f(num(c.pocketD)) + ' CENTER X' + f(num(c.cx)) + ' Y' + f(num(c.cy)));
    if (c.op === 'custom') L.push((CUSTOM_OPS[c.cop] || CUSTOM_OPS.outside) + ' OF ' + (c.shapes || []).length + ' SHAPE' + ((c.shapes || []).length === 1 ? '' : 'S') + (c.cop === 'path' ? ' ' + f(num(c.slotW)) + ' WIDE' : c.cop === 'pocket' || c.strategy === 'troch' ? ' TROCHOIDAL LOOPS DIA ' + f(num(c.trochD)) : ' OFFSET LOOPS') + (c.cop === 'outside' ? ' STOCK ' + (c.stockType === 'rect' ? f(num(c.stockM)) + ' AROUND' : f(num(c.stockW)) + ' PER SIDE') : ''));
    if (c.op === 'slot') L.push('SLOT ' + f(num(c.slotW)) + ' WIDE FROM X' + f(num(c.x1)) + ' Y' + f(num(c.y1)) + ' TO X' + f(num(c.x2)) + ' Y' + f(num(c.y2)) + ' ' + (c.slotEntry === 'helix' ? 'HELIX' : 'OPEN') + ' ENTRY');
    L.push('DEPTH ' + f(K.depth) + ' IN ' + K.levels + ' LEVEL' + (K.levels > 1 ? 'S' : '') + ' OF ' + f(K.ap) + '  Z0 = TOP OF PART',
      'CLEARANCE PLANE Z' + f(K.safeZ) + '  RAPID PLANE Z' + f(K.rapidZ) + '  BETWEEN CUTS LIFT TO ' + (c.retract === 'clear' ? 'CLEARANCE' : 'RAPID') + ' PLANE',
      'TOOL T' + K.toolNo + ' DIA ' + f(K.D) + ' ' + K.Z + 'FL  LOC ' + f(K.loc) + '  STICKOUT ' + f(K.stick),
      'MATERIAL ' + clean((MATERIALS[c.mat] || { name: 'CUSTOM' }).name) + (c.coating && c.coating !== 'auto' && COATINGS[c.coating] ? '  COATING ' + clean(COATINGS[c.coating].name.split(':')[0]) : ''),
      c.passes === 'finish' ? 'NO ROUGHING' : 'ROUGH ' + K.rough.rpm + ' RPM ' + Math.round(K.rough.sfm) + ' SFM  AE ' + f(K.ae) + '  AP ' + f(K.ap) + '  F' + feedFmt(K.rough.feed) + '  FZ ' + K.rough.fzProg.toFixed(4) + ' PROGRAMMED',
      c.finish ? 'FINISH ' + K.fin.rpm + ' RPM  STOCK ' + f(K.finStock) + '  F' + feedFmt(K.fin.feed) + (c.spring ? '  + SPRING PASS' : '') : 'NO FINISH PASS',
      (c.passes === 'finish' ? 'MRR ' + K.mrrFin.toFixed(2) + ' CU IN/MIN  ABOUT ' + (K.mrrFin * K.unitHp).toFixed(1) : 'MRR ' + K.mrr.toFixed(2) + ' CU IN/MIN  ABOUT ' + K.hpNeed.toFixed(1)) + ' HP  CYCLE ABOUT ' + r.stats.minutes.toFixed(1) + ' MIN');
    return L.map(clean);
  }

  // ---------------------------------------------------------------- what the program does
  // From the moves themselves: which sections actually cut. 'ROUGH + FINISH', 'ROUGH ONLY', 'FINISH ONLY' or ''.
  function passes(r) {
    let sec = '', rough = false, fin = false;
    for (const m of r.moves) {
      if (m.t === 'SEC') { sec = m.name; continue; }
      if (m.t === 'G1' || m.t === 'G2' || m.t === 'G3') { if (sec === 'FINISH') fin = true; else rough = true; }
    }
    return { rough, finish: fin, label: rough && fin ? 'ROUGH + FINISH' : rough ? 'ROUGH ONLY' : fin ? 'FINISH ONLY' : '' };
  }
  const opName = c => c.op === 'custom' ? (CUSTOM_OPS[c.cop] || CUSTOM_OPS.outside) : OPS[c.op];

  // ---------------------------------------------------------------- G-code
  function toGcode(r, extraLines) {
    const c = r.cfg, K = r.K, dec = Math.max(2, Math.min(6, Math.round(num(c.dec, 4)))), f = numFmt(dec), rd = v => +(+v).toFixed(dec);
    const L = []; let n = 0;
    const add = s => { if (c.lineNums && s[0] !== '(' && s !== '%') { n += 10; L.push('N' + n + ' ' + s); } else L.push(s); };
    const cool = String(c.cool || '').trim().toUpperCase(), coolOff = cool ? 'M9' : '';
    add('%');
    add('O' + String(Math.max(0, Math.round(num(c.prog, 1000)))).padStart(4, '0') + ' (' + clean(fileBase(c)).slice(0, 40) + ')');
    const P = passes(r);
    if (P.label) add('(TOOLPATH: ' + P.label + (P.rough && !P.finish ? ' - ROUGHED TO SIZE, NO FINISH PASS' : P.finish && !P.rough ? ' - PART MUST ALREADY BE ROUGHED, ' + fx(r.K.finStock) + ' LEFT ON THE WALL' : '') + ')');
    describeLines(r).forEach(s => add('(' + s + ')'));
    add('G20 G17 G40 G49 G80 G90 G94');
    if (c.toolChange) add('T' + K.toolNo + ' M6');
    add(String(c.wcs || 'G54').toUpperCase().trim());
    let pos = { x: NaN, y: NaN, z: NaN }, lastF = null, spin = false;
    for (const m of r.moves) {
      if (m.t === 'C') { add('(' + clean(m.s) + ')'); continue; }
      if (m.t === 'SEC') { add('(===== ' + (m.name === 'FINISH' ? 'FINISH PASS' : 'ROUGHING') + ' =====)'); add('S' + m.rpm + (spin ? '' : ' M3')); spin = true; continue; }
      const w = [];
      const X = rd(m.x), Y = rd(m.y), Zv = rd(m.z);
      if (m.t === 'G0') {
        if (X !== rd(pos.x)) w.push('X' + f(X));
        if (Y !== rd(pos.y)) w.push('Y' + f(Y));
        if (!isNaN(m.z) && Zv !== rd(pos.z)) w.push('Z' + f(Zv));
        if (m.flag === 'tlo') { add('G0 G43 H' + K.toolNo + ' ' + w.join(' ')); if (cool) add(cool); }
        else if (w.length) add('G0 ' + w.join(' '));
      } else if (m.t === 'G1') {
        if (X !== rd(pos.x)) w.push('X' + f(X));
        if (Y !== rd(pos.y)) w.push('Y' + f(Y));
        if (Zv !== rd(pos.z)) w.push('Z' + f(Zv));
        if (!w.length) { pos = m; continue; }
        if (m.f !== lastF) { w.push('F' + feedFmt(m.f)); lastF = m.f; }
        add('G1 ' + w.join(' '));
      } else {
        const S = [rd(pos.x), rd(pos.y)], E = [X, Y], C = arcCentre(S, E, [m.cx, m.cy]);
        w.push('X' + f(X), 'Y' + f(Y));
        if (Zv !== rd(pos.z)) w.push('Z' + f(Zv));
        w.push('I' + f(rd(C[0] - S[0])), 'J' + f(rd(C[1] - S[1])));
        if (m.f !== lastF) { w.push('F' + feedFmt(m.f)); lastF = m.f; }
        add(m.t + ' ' + w.join(' '));
      }
      pos = m;
    }
    if (coolOff) add(coolOff);
    if (spin) add('M5');
    if (c.home) { add('G91 G28 Z0.'); add('G90'); }
    add('M30');
    (extraLines || []).forEach(s => L.push(s));
    L.push('%');
    return L.join('\n') + '\n';
  }

  // ---------------------------------------------------------------- Mazatrol (MANL PRG units through MACH1)
  // Each unit starts with G0 G90 X Y S M3 / G0 G17 Z / G1 G94 Z F (S M8 with coolant) so absolute, XY plane and
  // feed per minute hold whatever state the control was left in. A new spindle speed (roughing → finishing)
  // starts a new unit; a unit that fills up retracts and the next starts over the same point.
  function toMazatrol(r, MACH1) {
    const c = r.cfg, K = r.K, ctl = c.mazCtl === 'SmoothM' ? 'SmoothM' : 'MatrixM';
    const dec = Math.max(2, Math.min(5, Math.round(num(c.dec, 4)))), rd = v => +(+v).toFixed(dec);
    const name = mazName(c);
    const p = MACH1.program({ control: ctl, name, units: 'inch', comment: clean('HEM ' + opName(c) + (passes(r).label ? ' - ' + passes(r).label : '')).slice(0, 48) });
    p.common({ MAT: String(c.mazMat || '').toUpperCase().slice(0, 8) || undefined, 'INITIAL-Z': num(c.mazInitZ, 1) });
    const nom = num(c.mazNom, 0) > 0 ? num(c.mazNom) : K.D;
    const tool = { TOOL: c.mazTool || 'END MILL', 'NOM-DIA': rd(nom) };
    const suf = String(c.mazSuf || '').trim().toUpperCase();
    if (suf) tool['@11'] = suf;
    const lim = MACH1.core.CONTROLS[ctl].seqLimit - 2;               // leave room for the unit's closing retract
    const cm = coolM(c), safe = rd(K.safeZ), rz = rd(K.rapidZ);
    let u = null, count = 0, pos = { x: NaN, y: NaN, z: NaN }, lastF = null, rpm = K.rough.rpm, units = 0, seqs = 0, lastWasSafe = false;
    const blk = w => { u.block(w); count++; seqs++; lastWasSafe = w.G === 0 && w.Z === safe && w.X === undefined; };
    // next: the move that opens the unit; a straight plunge becomes the unit's G1 G94 line itself
    const open = next => {
      u = p.unit('MANL PRG', tool); units++; count = 0;
      const plunge = next && next.t === 'G1' && rd(next.x) === rd(pos.x) && rd(next.y) === rd(pos.y);
      const zTo = plunge ? next.z : pos.z, fTo = plunge ? next.f : K.airFeed;
      blk({ G: [0, 90], X: rd(pos.x), Y: rd(pos.y), S: rpm, M: 3 });
      blk({ G: [0, 17], Z: rd(Math.max(pos.z, rz)) });
      blk(Object.assign({ G: [1, 94], Z: rd(zTo), F: +feedFmt(fTo) }, cm != null ? { S: rpm, M: cm } : {}));
      lastF = fTo;
      return plunge;
    };
    const close = () => { if (u && !lastWasSafe) blk({ G: 0, Z: safe }); u = null; };
    for (const m of r.moves) {
      if (m.t === 'C') continue;
      if (m.t === 'SEC') { rpm = m.rpm; close(); continue; }
      if (m.t === 'G0') {
        if (u) {
          if (count + 1 > lim) close();
          else {
            const w = { G: 0 };
            if (rd(m.x) !== rd(pos.x)) w.X = rd(m.x);
            if (rd(m.y) !== rd(pos.y)) w.Y = rd(m.y);
            if (!isNaN(m.z) && rd(m.z) !== rd(pos.z)) w.Z = rd(m.z);
            if (Object.keys(w).length > 1) blk(w);
          }
        }
        pos = m; continue;
      }
      if (!u || count + 1 > lim) { close(); if (open(m)) { pos = m; continue; } }
      const w = {};
      if (m.t === 'G1') {
        w.G = 1;
        if (rd(m.x) !== rd(pos.x)) w.X = rd(m.x);
        if (rd(m.y) !== rd(pos.y)) w.Y = rd(m.y);
        if (rd(m.z) !== rd(pos.z)) w.Z = rd(m.z);
        if (Object.keys(w).length === 1) { pos = m; continue; }
      } else {
        const S = [rd(pos.x), rd(pos.y)], E = [rd(m.x), rd(m.y)], C = arcCentre(S, E, [m.cx, m.cy]);
        w.G = m.t === 'G2' ? 2 : 3; w.X = E[0]; w.Y = E[1];
        if (rd(m.z) !== rd(pos.z)) w.Z = rd(m.z);
        w.I = +(C[0] - S[0]).toFixed(dec); w.J = +(C[1] - S[1]).toFixed(dec);
      }
      if (m.f !== lastF) { w.F = +feedFmt(m.f); lastF = m.f; }
      blk(w);
      pos = m;
    }
    close();
    const warn = p.check().slice();
    const nRec = p.p.recs.length;
    if (nRec > 2000) warn.push(nRec + ' records: MazaCAM warns that programs over 2,000 records may not fit in the control. Use fewer levels, a larger stepover or Smooth (.PBM).');
    if (!units) warn.push('Nothing to cut.');
    return { prog: p, units, seqs, nRec, warn, fileName: p.fileName, bytes: () => p.save(), listing: () => p.listing() };
  }

  // ---------------------------------------------------------------- settings in the G-code
  // JSON, UTF-8, base32 (A-Z 2-7, safe in any control's comments) in (CFG ...) lines after a
  // (SETTINGS DATA V1 <bytes> BYTES CHECK <fnv-1a>) line, after M30. Same scheme as the engraving app.
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32enc(bytes) { let o = '', bits = 0, v = 0; for (const b of bytes) { v = ((v & 0xFF) << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; o += B32[(v >>> bits) & 31]; } } if (bits > 0) o += B32[(v << (5 - bits)) & 31]; return o; }
  function b32dec(s) { const o = []; let bits = 0, v = 0; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) throw new Error('bad character'); v = ((v & 0x7F) << 5) | i; bits += 5; if (bits >= 8) { bits -= 8; o.push((v >>> bits) & 255); } } return new Uint8Array(o); }
  function fnvHex(bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).toUpperCase().padStart(8, '0'); }
  const enc = s => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));
  const dec8 = b => (typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(b) : Buffer.from(b).toString('utf8'));
  // Every setting, twice, in comments after M30:
  //  - readable: (SET key=value ...) lines and the shapes' points, for people and as a fallback;
  //  - exact: JSON, UTF-8, base32 in (CFG ...) lines after a (HEM SETTINGS DATA V2 <bytes> BYTES CHECK <fnv-1a>) line.
  // Open reads the exact copy; if an editor or control has damaged it (upper-cased text, cut lines), it falls
  // back to the readable one. Settings saved as (SETTINGS DATA V1 ...) before are read too.
  const ENUMS = { op: ['profile', 'pocket', 'slot', 'custom'], shape: ['rect', 'circle'], stockType: ['rect', 'even'], cop: ['outside', 'pocket', 'path'],
    strategy: ['offset', 'troch'], slotEntry: ['open', 'helix'], dir: ['climb', 'conv'], link: ['depth', 'lift'], passes: ['both', 'rough', 'finish'],
    mat: Object.keys(MATERIALS).concat(['custom']), dxfUnits: ['auto', 'in', 'mm'], mazCtl: ['MatrixM', 'SmoothM'], coating: Object.keys(COATINGS), retract: ['rapid', 'clear'], openSide: ['left', 'right'], openDir: ['oneway', 'zigzag'], pieceDir: ['zigzag', 'oneway'], pocketStrategy: ['auto', 'offset', 'troch'] };
  const cmt = v => String(v).replace(/[()]/g, '').replace(/[^\x20-\x7E]/g, '?');
  function settingsLines(cfg, when) {
    const keep = {}; for (const k of Object.keys(DEFAULTS)) keep[k] = cfg[k];
    const d = when || new Date(), p2 = n => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
    const out = ['(===== HEM TOOLPATH SETTINGS, SAVED ' + stamp + ' =====)', '(OPEN THIS FILE WITH OPEN .NC IN THE HEM TOOLPATH GENERATOR TO GET THEM ALL BACK)'];
    // readable: key=value, quoted when there is a space, packed into lines of about 70
    let line = '';
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'shapes' || k === 'cons') continue;       // written on their own lines below
      let v = keep[k]; v = typeof v === 'boolean' ? (v ? 'ON' : 'OFF') : cmt(v == null ? '' : v);
      const w = k + '=' + (/[\s=]/.test(v) || v === '' ? '"' + v.replace(/"/g, "'") + '"' : v);
      if (line && line.length + w.length > 66) { out.push('(SET ' + line + ')'); line = ''; }
      line += (line ? ' ' : '') + w;
    }
    if (line) out.push('(SET ' + line + ')');
    const shapes = Array.isArray(keep.shapes) ? keep.shapes : [], nPts = shapes.reduce((n, sh) => n + (sh.pts || []).length, 0);
    if (nPts <= 3000) shapes.forEach((sh, i) => {
      out.push('(SHAPE ' + (i + 1) + ' ' + (sh.closed ? 'CLOSED' : 'OPEN') + ' ' + sh.pts.length + ' POINTS X,Y,FILLET,ARC' + (sh.pts.some(q => +q[4]) ? ',OPEN EDGE' : '') + (sh.cut === false ? ' CAD ONLY' : '') + ')');
      let l = '';
      for (const q of sh.pts) { const w = [q[0], q[1], q[2] || 0, q[3] || 0].concat(+q[4] ? [1] : []).map(v => fx(+v || 0)).join(','); if (l && l.length + w.length > 66) { out.push('(PT ' + l + ')'); l = ''; } l += (l ? ' ' : '') + w; }
      if (l) out.push('(PT ' + l + ')');
    });
    (Array.isArray(keep.cons) ? keep.cons : []).forEach(g => out.push('(CONS ' + String(g.t).toUpperCase() + Object.keys(g).filter(k => k !== 't').map(k => ' ' + k.toUpperCase() + '=' + fx(+g[k] || 0)).join('') + ')'));
    if (nPts > 3000) out.push('(SHAPES: ' + shapes.length + ' WITH ' + nPts + ' POINTS, SAVED IN THE DATA BELOW ONLY)');
    // exact
    const bytes = enc(JSON.stringify({ app: 'hem', cfg: keep })), s = b32enc(bytes);
    out.push('(HEM SETTINGS DATA V2 ' + bytes.length + ' BYTES CHECK ' + fnvHex(bytes) + ')');
    for (let i = 0; i < s.length; i += 64) out.push('(CFG ' + s.slice(i, i + 64) + ')');
    out.push('(===== END OF SETTINGS =====)');
    return out;
  }
  // {cfg, from: 'data' | 'text', note} or null when the text has no saved settings
  function openSettings(text) {
    const lines = String(text).split(/\r?\n/).map(l => l.replace(/^\s*N\d+\s*/, '').trim());
    // the exact copy
    let head = null, data = '', why = '';
    for (const s of lines) {
      let m = s.match(/^\((?:HEM )?SETTINGS DATA V(\d+) (\d+) BYTES CHECK ([0-9A-F]{8})\)$/i);
      if (m) { head = { n: +m[2], h: m[3].toUpperCase() }; data = ''; continue; }
      m = s.match(/^\(CFG ([A-Z2-7]+)\)$/i); if (m && head) data += m[1].toUpperCase();
    }
    if (head) {
      try {
        const bytes = b32dec(data);
        if (bytes.length !== head.n || fnvHex(bytes) !== head.h) throw new Error('its check failed');
        const o = JSON.parse(dec8(bytes));
        if (!o || typeof o.cfg !== 'object') throw new Error('no settings inside');
        if (o.app !== 'hem') throw new Error('these settings are from another app');
        return { cfg: o.cfg, from: 'data' };
      } catch (e) { why = e.message; }
    }
    // the readable copy
    const byLower = {}; for (const k of Object.keys(DEFAULTS)) byLower[k.toLowerCase()] = k;
    const cfg = {}, shapes = [], cons = []; let found = 0;
    for (const s of lines) {
      let m = s.match(/^\(SET (.*)\)$/i);
      if (m) {
        for (const w of m[1].matchAll(/([A-Za-z0-9]+)=("([^"]*)"|\S*)/g)) {
          const k = byLower[w[1].toLowerCase()]; if (!k || k === 'shapes' || k === 'cons') continue;
          let v = w[3] !== undefined ? w[3] : w[2];
          if (typeof DEFAULTS[k] === 'boolean') v = /^(ON|TRUE|1)$/i.test(v);
          else if (ENUMS[k]) { const hit = ENUMS[k].find(o => o.toLowerCase() === String(v).toLowerCase()); if (!hit) continue; v = hit; }
          cfg[k] = v; found++;
        }
        continue;
      }
      m = s.match(/^\(SHAPE \d+ (CLOSED|OPEN)\b/i);
      if (m) { const sh = { closed: /CLOSED/i.test(m[1]), pts: [] }; if (/CAD ONLY/i.test(s)) sh.cut = false; shapes.push(sh); continue; }
      m = s.match(/^\(CONS (POINT|LINE2|LINE|CIRCLE)((?:\s+[A-Z0-9]+=[-\d.]+)*)\)$/i);
      if (m) { const g = { t: m[1].toLowerCase() }; for (const w of m[2].matchAll(/([A-Z0-9]+)=([-\d.]+)/gi)) g[w[1].toLowerCase()] = +w[2]; cons.push(g); found++; continue; }
      m = s.match(/^\(PT (.*)\)$/i);
      if (m && shapes.length) for (const w of m[1].trim().split(/\s+/)) { const q = w.split(',').map(Number); if (q.length >= 2 && q.every(isFinite)) shapes[shapes.length - 1].pts.push([q[0], q[1], q[2] || 0, q[3] || 0].concat(q[4] ? [1] : [])); }
    }
    if (!found) { if (head) throw new Error('the saved settings are damaged (' + why + ') and there is no readable copy'); return null; }
    if (shapes.length) cfg.shapes = shapes;
    cfg.cons = cons;                                        // the readable copy lists every construction item (none = none)
    return { cfg, from: 'text', note: head ? 'The exact copy was damaged (' + why + '), so the readable copy was used.' : 'Read from the readable copy.' };
  }
  function readSettings(text) { const o = openSettings(text); return o ? o.cfg : null; }

  // Move work zero to (x, y) of the current coordinates: every point and every coordinate setting shifts by
  // (-x, -y), so nothing moves relative to the part. Returns the new settings.
  function moveOrigin(cfg, x, y) {
    const c = Object.assign({}, cfg), G = Geo();
    const shift = (k, d) => { if (c[k] !== undefined && String(c[k]).trim() !== '') c[k] = String(+(num(c[k], 0) - d).toFixed(5)); };
    if (Array.isArray(c.shapes)) c.shapes = G.moveShapes(c.shapes, -x, -y);
    shift('cx', x); shift('cy', y); shift('x1', x); shift('y1', y); shift('x2', x); shift('y2', y); shift('entryX', x); shift('entryY', y);
    if (Array.isArray(c.cons)) c.cons = c.cons.map(g => { const h = { ...g }; for (const [kx, ky] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) if (h[kx] !== undefined) { h[kx] = +(h[kx] - x).toFixed(5); h[ky] = +(h[ky] - y).toFixed(5); } return h; });
    return c;
  }

  const api = { COATINGS, matNumbers, moveOrigin, openSettings, passes, CUSTOM_OPS, DEFAULTS, MATERIALS, OPS, calc, rctf, generate, toGcode, toMazatrol, settingsLines, readSettings, fileBase, mazName, arcSweep, describeLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HEM = api;
})(this);

