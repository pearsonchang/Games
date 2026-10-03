'use strict';
const {configuredStore} = require('../server/store.cjs');
const {createHandler} = require('../server/http.cjs');
let store;
module.exports = createHandler(() => store ||= configuredStore(), {secure: true});
