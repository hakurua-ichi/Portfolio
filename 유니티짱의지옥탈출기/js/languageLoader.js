/**
 * 📄 js/languageLoader.js
 * * ko.js와 en.js를 'import'하고, 
 * * languagePack을 'export'합니다.
 */

import { langDataKO } from './lang/ko.js';
import { langDataEN } from './lang/en.js';

export const languagePack = {
    ko: langDataKO,
    en: langDataEN
};