import type { Language, TypeNode } from '../typeInfer'
import { generate as generateGo } from './go'
import { generate as generateJava } from './java'
import { generate as generateRust } from './rust'
import { generate as generateTypescript } from './typescript'

export const generators: Record<Language, (root: TypeNode, rootName: string) => string> = {
  ts: generateTypescript,
  go: generateGo,
  java: generateJava,
  rust: generateRust
}
