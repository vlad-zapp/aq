const { parseAllDocuments } = require('yaml');
const input = `
defaults: &defaults
  timeout: 10
development:
  <<: *defaults
  debug: true
`;
const docs = parseAllDocuments(input);
console.log(JSON.stringify(docs[0].toJS(), null, 2));

const docs11 = parseAllDocuments(input, { version: '1.1' });
console.log('1.1:', JSON.stringify(docs11[0].toJS(), null, 2));

const docsMerge = parseAllDocuments(input, { merge: true });
console.log('Merge:', JSON.stringify(docsMerge[0].toJS(), null, 2));
