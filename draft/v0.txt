## Problem

The existing specification of FIND is unclear wrt what xts are
returned under what conditions.  It also uses a different notion of
immediacy from the one in the Definition of Terms.  From the rationale
of FIND, it is obvious that cmForth inspired the idea that two
different xts can be returned.  The rationale of COMPILE, shows that
the intention is that FIND can be usable for the user-defined text
interpreter.  But FIND as specified does not guarantee that.  This
proposal would fix this problem; it is also phrased in a way that
includes systems like cmForth and Mark Humphries' system.

## Proposal

Replace the text in the specification of FIND with:

Find the definition named in the counted string at c-addr.  If the
definition is not found, return c-addr and zero.  If the definition is
found, return xt 1 or xt -1.  The returned values may differ between
interpretation and compilation state.  In interpretation state,
EXECUTEing the returned xt performs the interpretation semantics of
the word.  In compilation state, the returned values represent the
compilation semantics: if xt 1 is returned, then EXECUTEing xt
performs the compilation semantics; if xt -1 is returned, then
COMPILE,ing xt performs the compilation semantics.
