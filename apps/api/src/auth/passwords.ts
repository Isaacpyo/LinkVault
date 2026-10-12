import bcrypt from 'bcryptjs';

const COST = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, COST);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/**
 * Hash of a random string, compared against when an email is unknown so that
 * login takes the same time whether or not the account exists.
 */
export const DUMMY_HASH = bcrypt.hashSync('linkvault-timing-equalizer', COST);
