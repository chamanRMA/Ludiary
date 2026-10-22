-- Data only (ADR 73): the Steam connector used to reject PNG cover names (portrait.png), so some games were marked
-- as resolved with a guessed URL that returns 404. Forget the resolution so the next scan asks GetItems again.
UPDATE `game_properties` SET `store_metadata` = json_remove(`store_metadata`, '$.mediaResolvedAt', '$.resolvedMedia') WHERE `store` = 'steam' AND `store_metadata` IS NOT NULL AND json_valid(`store_metadata`);
