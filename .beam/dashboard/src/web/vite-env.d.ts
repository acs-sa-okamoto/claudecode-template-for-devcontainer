// Vite アセットの型宣言。CSS インポートを TypeScript に認識させる。
declare module "*.css" {
  const content: string
  export default content
}
