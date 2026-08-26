export const sections = ['Start here', 'Make diagrams', 'Under the hood'] as const;
export const createCommand = 'npm create dumb-diagrams@latest';
export const installCommand = 'npm install -g create-dumb-diagrams';
export const repository = import.meta.env.PUBLIC_REPOSITORY_URL || '';
export const npmUrl = 'https://www.npmjs.com/package/create-dumb-diagrams';
export function url(path = '') {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
