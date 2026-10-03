'use strict';
const {randomBytes} = require('node:crypto');
// Server-only provider boundary. A future VRF/commit-reveal adapter must resolve
// before a round starts, persist its proof, and never disclose a live board seed.
// This default is CSPRNG, not blockchain randomness or a verifiable-randomness claim.
function random() { return randomBytes(6).readUIntBE(0, 6) / 281474976710656; }
module.exports = {random};
