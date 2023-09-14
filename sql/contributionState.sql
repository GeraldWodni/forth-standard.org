-- get current state of contribution
CREATE OR REPLACE FUNCTION contributionState (contributionId INT) RETURNS VARCHAR(32) RETURN
COALESCE(
    (SELECT newState
    FROM replies
    WHERE contribution=contributionId
    AND newState IS NOT NULL
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
    WHEN state='voting' THEN 0
    WHEN state='formal' THEN 10
    WHEN state='informal' THEN 20
    WHEN state='considered' THEN 30
    WHEN state='accepted' THEN 40
    WHEN state='rejected' THEN 50
    WHEN state='retiered' THEN 60
    ELSE 100
END;
