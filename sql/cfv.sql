-- call for votes
CREATE TABLE castSystemVotes (
    reply INT NOT NULL,
    system VARCHAR(128) NOT NULL,
    answer VARCHAR(255) NOT NULL,
    PRIMARY KEY(reply)
);

CREATE TABLE castProgrammerVotes (
    reply INT NOT NULL,
    answer VARCHAR(255) NOT NULL,
    PRIMARY KEY(reply)
);
