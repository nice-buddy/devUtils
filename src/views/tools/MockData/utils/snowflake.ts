export const DEFAULT_EPOCH = 1288834974657n

export interface SnowflakeState {
  lastTimestamp: number
  sequence: number
}

export interface SnowflakeParts {
  timestamp: number
  machineId: number
  sequence: number
}

// 41 位毫秒 + 10 位机器号 + 12 位序列；同毫秒序列自增，用满 4096 推进到下一毫秒
export function nextSnowflake(state: SnowflakeState, machineId: number, epoch: bigint, now: number): bigint {
  let timestamp = Math.max(Math.floor(now), state.lastTimestamp)
  if (timestamp === state.lastTimestamp) {
    state.sequence += 1
    if (state.sequence > 0xfff) {
      timestamp += 1
      state.sequence = 0
    }
  } else {
    state.sequence = 0
  }
  state.lastTimestamp = timestamp
  return ((BigInt(timestamp) - epoch) << 22n) | (BigInt(machineId & 0x3ff) << 12n) | BigInt(state.sequence)
}

export function decodeSnowflake(id: bigint, epoch: bigint): SnowflakeParts {
  return {
    timestamp: Number((id >> 22n) + epoch),
    machineId: Number((id >> 12n) & 0x3ffn),
    sequence: Number(id & 0xfffn)
  }
}
