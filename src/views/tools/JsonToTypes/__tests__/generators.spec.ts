import { describe, expect, it } from 'vitest'
import { inferFromJson } from '../utils/typeInfer'
import { generators } from '../utils/generators'
import { escapeIdentifier, toCamel, toPascal, toSnake, uniqueTypeName } from '../utils/generators/naming'

function rootOf(raw: string) {
  const { root, error } = inferFromJson(raw)
  expect(error).toBeUndefined()
  return root!
}

describe('json-to-types 命名工具', () => {
  it('按 key 生成各语言标识符', () => {
    expect(toPascal('user_name')).toBe('UserName')
    expect(toCamel('user_name')).toBe('userName')
    expect(toSnake('userName')).toBe('user_name')
    expect(escapeIdentifier('ts', 'user-name')).toBe('"user-name"')
    expect(escapeIdentifier('go', 'user_name')).toBe('UserName')
    expect(escapeIdentifier('java', 'class')).toBe('class_')
    expect(escapeIdentifier('rust', 'type')).toBe('type_')
    expect(escapeIdentifier('rust', '2fa_enabled')).toBe('_2fa_enabled')
  })

  it('类型名撞车时追加数字后缀', () => {
    const registry = new Set<string>(['User'])
    expect(uniqueTypeName(registry, 'User')).toBe('User2')
    expect(uniqueTypeName(registry, 'User')).toBe('User3')
    expect(registry.has('User2')).toBe(true)
  })
})

describe('json-to-types 生成器', () => {
  const sample = '{"id":1892837482910293847,"name":"devutils","tags":["a"],"owner":{"id":1},"type":"x"}'

  it('生成 TypeScript：大整数转 string 并附注释，保留字属性加引号', () => {
    const out = generators.ts(rootOf(sample), 'RootObject')
    expect(out).toContain('export interface RootObject {')
    expect(out).toContain('  id: string; // 原值超出 JS 安全整数范围，已按字符串处理')
    expect(out).toContain('  name: string;')
    expect(out).toContain('  tags: string[];')
    expect(out).toContain('  owner: RootObjectOwner;')
    expect(out).toContain('export interface RootObjectOwner {')
  })

  it('生成 Go：int64 范围内的大整数用 int64，超出范围回退 string 并附注释', () => {
    const inRange = generators.go(rootOf('{"id":1892837482910293847}'), 'RootObject')
    expect(inRange).toContain('type RootObject struct {')
    expect(inRange).toContain('\tId int64 `json:"id"`')

    const outOfRange = generators.go(rootOf('{"id":9223372036854775808}'), 'RootObject')
    expect(outOfRange).toContain('\tId string `json:"id"` // 原值超出 int64 范围，已按字符串处理')
  })

  it('生成 Go：可选字段加指针与 omitempty，切片不加指针', () => {
    const out = generators.go(rootOf('[{"a":1,"tags":["x"]},{"tags":["y"]}]'), 'RootObject')
    expect(out).toContain('\tA *int64 `json:"a,omitempty"`')
    expect(out).toContain('\tTags []string `json:"tags"`')
    expect(out).toContain('type RootObject []RootObjectItem')
  })

  it('生成 Java：私有字段 + @JsonProperty + @Nullable，嵌套为静态内部类', () => {
    const out = generators.java(rootOf('{"user":{"name":"a"},"nickname":null}'), 'RootObject')
    expect(out).toContain('import com.fasterxml.jackson.annotation.JsonProperty;')
    expect(out).toContain('public class RootObject {')
    expect(out).toContain('    @JsonProperty("user")')
    expect(out).toContain('    private RootObjectUser user;')
    expect(out).toContain('    @Nullable')
    expect(out).toContain('    private Object nickname;')
    expect(out).toContain('    public static class RootObjectUser {')
  })

  it('生成 Rust：snake_case + serde rename，可选字段为 Option', () => {
    const out = generators.rust(rootOf('{"userName":"a","type":1}'), 'RootObject')
    expect(out).toContain('use serde::{Deserialize, Serialize};')
    expect(out).toContain('#[derive(Serialize, Deserialize)]')
    expect(out).toContain('pub struct RootObject {')
    expect(out).toContain('    #[serde(rename = "userName")]')
    expect(out).toContain('    pub user_name: String,')
    expect(out).toContain('    pub type_: i64,')
  })

  it('生成 Rust：超出 int64 的大整数回退 String', () => {
    const out = generators.rust(rootOf('{"id":9223372036854775808}'), 'RootObject')
    expect(out).toContain('    pub id: String, // 原值超出 int64 范围，已按字符串处理')
  })

  it('根为对象数组时输出 Item 类型与根别名', () => {
    const ts = generators.ts(rootOf('[{"id":1}]'), 'RootObject')
    expect(ts).toContain('export interface RootObjectItem {')
    expect(ts).toContain('export type RootObject = RootObjectItem[]')
    const rust = generators.rust(rootOf('[{"id":1}]'), 'RootObject')
    expect(rust).toContain('pub type RootObject = Vec<RootObjectItem>;')
    const java = generators.java(rootOf('[{"id":1}]'), 'RootObject')
    expect(java).toContain('private List<RootObjectItem> items;')
  })

  it('嵌套类型同名时追加后缀，避免重复声明', () => {
    // user-name 与 user_name 切词后都是 ['user', 'name']，归一后撞名，第二个追加数字后缀。
    const out = generators.ts(rootOf('{"user-name":{"x":1},"user_name":{"y":2}}'), 'RootObject')
    expect(out).toContain('export interface RootObjectUserName {')
    expect(out).toContain('export interface RootObjectUserName2 {')
  })

  it('空对象与空数组退化为 any / interface{}', () => {
    expect(generators.ts(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('  a: any;')
    expect(generators.ts(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('  b: any[];')
    expect(generators.go(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('\tA interface{} `json:"a"`')
    expect(generators.go(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('\tB []interface{} `json:"b"`')
  })
})
