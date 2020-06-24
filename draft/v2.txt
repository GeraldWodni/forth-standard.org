## ChangeLog

2018-05-17: Wording changes following the suggestion by JennyBrien

2018-05-29: Specify FIND for words without interpretation semantics,
and loosen it for TO IS ACTION-OF.  Added Remarks section for a
rationale of these additions.

2018-05-23: Initial version

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

> Find the definition named in the counted string at c-addr.  If the
> definition is not found, return c-addr and zero.  If the definition is
> found, return xt 1 or xt -1.  The returned values may differ between
> interpretation and compilation state:
>
> In interpretation state: If the definition has interpretation
> semantics, FIND returns xt 1 or xt -1, and EXECUTEing xt performs
> the interpretation semantics of the word.  If the definition has no
> interpretation semantics, FIND may produce c-addr 0; if it produces
> xt 1 or xt -1, EXECUTEing xt performs a system-dependent action.
>
> In compilation state, the returned values represent the
> compilation semantics: if xt 1 is returned, then EXECUTEing xt
> performs the compilation semantics; if xt -1 is returned, then
> COMPILE,ing xt performs the compilation semantics.
>  
> If the definition is for a word for which POSTPONE is ambiguous, it is
> ambiguous to perform the xt returned by FIND in a STATE different from
> the STATE during FIND.

In 4.1.2 Ambiguous conditions, add the ambiguous condition above, and
remove "6.1.1550 FIND" from

> attempting to obtain the execution token, (e.g., with 6.1.0070 ',
> 6.1.1550 FIND, etc. of a definition with undefined interpretation
> semantics;

## Remarks

The removal of FIND from the clause in 4.1.2 ensures that we can
text-interpret (in compile STATE) words without interpretation
semantics, such as IF.  The description of the behaviour of FIND for
these words in interpretation STATE allows implementations that do not
find such words, implementations that return the xt for an error,
implementations that return the xt for the compilation semantics, and
implementations that return the xt for some system-specific
interpretation semantics.

The ambiguous condition allows STATE-smart implementations of TO, IS
and ACTION-OF (as Forth-94 and Forth-2012 do).

Note that this does not allow STATE-smart implementations of words
without interpretation semantics (e.g., IF), but then, that's already
forbidden by POSTPONE and [COMPILE].
