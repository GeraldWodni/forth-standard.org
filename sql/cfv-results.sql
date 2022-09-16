DELIMITER //
DROP PROCEDURE IF EXISTS votingResults//
CREATE PROCEDURE votingResults (IN contributionId INT)
BEGIN

WITH programmerVotes AS (
	SELECT
		users.name AS userName,
		replies.user,
		castProgrammerVotes.*,
		ROW_NUMBER() OVER (PARTITION BY replies.user ORDER BY replies.id DESC) AS `rowNumber`
	FROM replies
    INNER JOIN users
    ON users.id=replies.user
	LEFT JOIN castProgrammerVotes
	ON castProgrammerVotes.reply=replies.id
	WHERE replies.contribution=contributionId
	AND castProgrammerVotes.reply IS NOT NULL
)
SELECT *
FROM programmerVotes
WHERE rowNumber=1
ORDER BY answer, reply;

WITH systemVotes AS (
	SELECT
		users.name AS userName,
		replies.user,
		castSystemVotes.*,
		ROW_NUMBER() OVER (PARTITION BY replies.user, castSystemVotes.name ORDER BY replies.id DESC) AS `rowNumber`
	FROM replies
    INNER JOIN users
    ON users.id=replies.user
	LEFT JOIN castSystemVotes
	ON castSystemVotes.reply=replies.id
	WHERE replies.contribution=contributionId
	AND castSystemVotes.reply IS NOT NULL
)
SELECT *
FROM systemVotes
WHERE rowNumber=1
ORDER BY answer, reply;

END //
DELIMITER ;

CALL votingResults(263);