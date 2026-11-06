import { DGM_KEYWORDS } from '@dumb-diagrams/runtime/dsl';

const keywords = [...new Set(Object.values(DGM_KEYWORDS).flat())].join('|');

export const dgmLanguage = {
  name: 'dgm',
  scopeName: 'source.dgm',
  repository: {},
  patterns: [
    { name: 'string.quoted.double', begin: '"', end: '"', patterns: [{ name: 'constant.character.escape', match: '\\\\.' }] },
    { name: 'entity.name.type', match: '\\b(aws|azure|gcp|cloud-agnostic)\\.[a-zA-Z0-9_.-]+' },
    { name: 'keyword.control', match: `(?<![\\w.-])(${keywords})(?![\\w.-])` },
    { name: 'constant.numeric', match: '-?\\b[0-9]+(\\.[0-9]+)?\\b' },
    { name: 'keyword.operator', match: '->' },
  ],
};
