-- get current state of contribution
CREATE OR REPLACE FUNCTION contributionState (contributionId INT) RETURNS VARCHAR(32) RETURN
COALESCE(
    (SELECT newState
    FROM replies
    WHERE contribution=contributionId
    ORDER BY replies.created DESC
    LIMIT 1)
,   (SELECT 'informal'
    FROM contributions
    WHERE id=contributionId
    AND `type`='proposal')
,'open');

-- provide sorting for state
CREATE OR REPLACE FUNCTION contributionStateOrder (state VARCHAR(255)) RETURNS INT RETURN
CASE
    WHEN state='informal' THEN 0
    WHEN state='rejected' THEN 3
    ELSE 10
END;
