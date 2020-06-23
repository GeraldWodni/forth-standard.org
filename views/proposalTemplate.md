# Proposal

This is the normative part, i.e., the meat of the RfD.

Before you go to a CfV, this should be as well-specified as possible, but you can start out with some issues undecided (that you want to decide in the RfD stage); mention these issues in the Remarks section, maybe also in the proposal section. If you want to leave something open to the system implementor, make that explicit (possibly by making it an ambiguous condition).

For word definitions, you probably can get inspirations for the wording from similar word definitions in the ANS Forth document (e.g., for DEFER I looked at existing defining words, and for IS at TO).
Informative parts
The rest of the RfD is informative stuff, giving a rationale for the proposal, so that system implementors and programmers will see what it is good for and why they should adopt it (and vote for it). We have:

## Problem

This states what problem your RfD attacks. It usually comes before the proposal.

## Typical use

Shows a typical use of the word/feature you propose; this should make the formal wording easier to understand.
Remarks
This gives the rationale for specific decisions you have taken in the proposal, or discusses specific issues that have not been decided yet.
Reference implementation
This makes it easier for system implementors to adopt your proposal. If you can provide an implementation in ANS Forth, great. If you can provide an implementation that requires system-specific stuff, ok (but you may have to explain the system-specific stuff). Otherwise, too bad.

## Test cases

This should test the feature/words you propose, in particular, it should test corner cases.
Experience
Where is the proposal already implemented? Where is it used?

## Comments

Initially empty. Once you get feedback for the RfD, this is the place for comments that you consider interesting, but don't find a different place for in the RfD. 
