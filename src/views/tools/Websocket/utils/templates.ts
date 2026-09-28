export interface WsTemplate {
  id: string
  name: string
  payload: string
}

export function addTemplate(list: WsTemplate[], template: WsTemplate): WsTemplate[] {
  return [...list, template]
}

export function updateTemplate(list: WsTemplate[], id: string, patch: Partial<WsTemplate>): WsTemplate[] {
  return list.map(item => (item.id === id ? { ...item, ...patch, id: item.id } : item))
}

export function removeTemplate(list: WsTemplate[], id: string): WsTemplate[] {
  return list.filter(item => item.id !== id)
}
