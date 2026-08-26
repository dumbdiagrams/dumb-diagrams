export const dgmLanguage = {
  name: 'dgm',
  scopeName: 'source.dgm',
  repository: {},
  patterns: [
    { name: 'comment.line', match: '//.*$' },
    { name: 'string.quoted.double', begin: '"', end: '"' },
    { name: 'keyword.control', match: '\\b(diagram|grammar|flow|title|view|group|id|step|kind|from|to|label|style|role)\\b' },
    { name: 'entity.name.type', match: '\\b(aws|generic|azure|gcp)\\.[a-zA-Z0-9_.-]+' },
    { name: 'constant.numeric', match: '\\b[0-9]+\\b' },
    { name: 'keyword.operator', match: '->' },
  ],
};
