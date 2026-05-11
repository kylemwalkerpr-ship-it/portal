declare const jest: any
declare const beforeEach: any
declare const test: any
declare const expect: any

declare module 'supertest' {
  const request: any
  export default request
}
