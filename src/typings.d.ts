// 项目级 typings。
// Umi 生成的 src/.umi/typings.d.ts 把 *.css 视作 CSS Modules（导出 classes）；
// 这里补充一份侧副作用导入的形式，允许 `import './xxx.css'` 这种写法。
declare module '*.css';
declare module '*.less';

declare namespace NodeJS {
  interface ProcessEnv {
    UMI_APP_API_BASE_URL?: string;
  }
}
