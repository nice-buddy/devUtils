# 第三阶段批次 D 实施计划：X.509 证书解析与二维码生成 / 解码

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DevUtils 增加 `x509`（X.509 证书解析）与 `qrcode`（二维码生成 / 解码）两个工具，证书解析走 Rust，二维码走前端纯 JS。

**Architecture:** 证书解析放在新增的 `src-tauri/src/commands/x509.rs`（`x509-parser` crate），前端只做展示与展示层格式化；二维码用 `qrcode` + `jsqr` 两个纯 JS 库在前端完成，导出 PNG 复用批次 C 已有的 `save_binary_file` 命令，Rust 侧零改动。两个工具都遵循既有契约：`props: { tabId, initialSnapshot }`、250ms 防抖快照、派生结果不入库。

**Tech Stack:** Tauri 2 + Vue 3 + TypeScript + Naive UI + Vitest；Rust `x509-parser` 0.18；npm `qrcode` 1.5.4 + `jsqr` 1.4.0（+ dev `@types/qrcode`）。

**Spec:** `docs/superpowers/specs/2026-09-28-phase3-batch-d-design.md`

## Global Constraints

- 目录约定：`src/views/tools/<ToolName>/<ToolName>.vue` + `utils/*.ts` + `__tests__/*.spec.ts`；视图只做状态绑定，纯逻辑进 `utils`。
- Props 契约：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照契约：`props.initialSnapshot?.x ?? <默认值>` 回填；`tabStore.updateTabSnapshot(props.tabId, {...})` 落库；文本输入 250ms 防抖；**只持久化输入与视图选项，派生结果一律不入库**；`onBeforeUnmount` 里清定时器并补一次保存。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态，不抛未捕获异常。
- 依赖上限：Rust 只新增 `x509-parser = "0.18"`（**保持默认特性，不得启用 `verify` / `verify-aws`**，否则会引入 `ring` / `aws-lc-rs`）；npm 只新增 `qrcode`、`jsqr` 与 devDependency `@types/qrcode`。
- 每个任务收尾必须：`npm test` + `npm run build` 通过；涉及 Rust 的任务额外跑 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml`；然后单独提交一次 git。
- 沙箱说明：`cargo test` 里的 `test_http` 用例需要回环网络，在受限沙箱内会失败，需要在沙箱外重跑确认。

---

### Task 1: 依赖安装、工具注册与 Rust 证书解析命令

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/commands/x509.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `package.json`（通过 `npm install`）
- Modify: `src/types/tool.ts`
- Modify: `src/App.vue`
- Create: `src/views/tools/X509/X509.vue`（占位，Task 2 替换）
- Create: `src/views/tools/Qrcode/Qrcode.vue`（占位，Task 4 替换）

**Interfaces:**
- Produces:
  - Tauri 命令 `parse_certificate(input: string) -> CertificateInfo`（字段见下）
  - 工具 id：`x509`、`qrcode`
- Consumes: 无

- [ ] **Step 1: 安装前端依赖**

```bash
npm install qrcode@^1.5.4 jsqr@^1.4.0
npm install -D @types/qrcode@^1.5.6
```

Expected：`package.json` 的 `dependencies` 多出 `qrcode`、`jsqr`，`devDependencies` 多出 `@types/qrcode`。

- [ ] **Step 2: 新增 Rust 依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 末尾（`uuid = ...` 之后）追加一行：

```toml
x509-parser = "0.18"
```

**不要**写成 `features = ["verify"]` 之类——那会引入 `ring`。

- [ ] **Step 3: 注册两个工具**

在 `src/types/tool.ts` 的 `TOOLS` 数组末尾追加两条：

```ts
  {
    id: 'x509',
    name: 'X.509 证书解析',
    description: 'PEM/DER/Base64 证书解析，主体、有效期、SAN、扩展与 SHA-1/SHA-256 指纹',
    category: 'crypto',
    icon: 'ShieldCheck',
    keywords: ['x509', 'certificate', 'pem', 'der', 'ssl', 'tls', 'fingerprint', '证书']
  },
  {
    id: 'qrcode',
    name: '二维码生成与解码',
    description: '文本生成二维码（纠错等级/尺寸/颜色）与剪贴板图片解码',
    category: 'dev',
    icon: 'QrCode',
    keywords: ['qrcode', 'qr', 'barcode', 'encode', 'decode', '二维码']
  }
```

在 `src/App.vue` 的 `defineAsyncComponent` 区块末尾（`ImageBase64Tool` 之后）追加：

```ts
const X509Tool = defineAsyncComponent(() => import('@/views/tools/X509/X509.vue'))
const QrcodeTool = defineAsyncComponent(() => import('@/views/tools/Qrcode/Qrcode.vue'))
```

在 `resolveBaseComponent` 里 `image-base64` 分支之后追加：

```ts
  if (toolId === 'x509') {
    return X509Tool
  }
  if (toolId === 'qrcode') {
    return QrcodeTool
  }
```

创建两个占位视图（Task 2 / Task 4 会整体替换）：

`src/views/tools/X509/X509.vue`：

```vue
<script setup lang="ts">
defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
</script>

<template>
  <div class="h-full flex items-center justify-center text-xs text-slate-400">待实现</div>
</template>
```

`src/views/tools/Qrcode/Qrcode.vue`：

```vue
<script setup lang="ts">
defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
</script>

<template>
  <div class="h-full flex items-center justify-center text-xs text-slate-400">待实现</div>
</template>
```

- [ ] **Step 4: 写失败的 Rust 单测**

创建 `src-tauri/src/commands/x509.rs`，先只放数据结构、一个返回错误的桩函数与测试模块：

```rust
use base64::Engine;
use serde::Serialize;
use sha2::Digest;
use x509_parser::prelude::*;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameFields {
    pub common_name: Option<String>,
    pub organization: Vec<String>,
    pub organizational_unit: Vec<String>,
    pub country: Vec<String>,
    pub state: Vec<String>,
    pub locality: Vec<String>,
    pub email: Vec<String>,
    pub raw: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fingerprints {
    pub sha1: String,
    pub sha256: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    pub subject: NameFields,
    pub issuer: NameFields,
    pub serial_hex: String,
    pub version: String,
    pub not_before: String,
    pub not_after: String,
    pub days_remaining: i64,
    pub is_expired: bool,
    pub signature_algorithm: String,
    pub public_key_algorithm: String,
    pub public_key_bits: Option<u32>,
    pub subject_alt_names: Vec<String>,
    pub key_usage: Vec<String>,
    pub extended_key_usage: Vec<String>,
    pub is_ca: bool,
    pub path_len_constraint: Option<u32>,
    pub self_signed: bool,
    pub fingerprints: Fingerprints,
    pub der_hex: String,
    pub pem: String,
}

#[tauri::command]
pub fn parse_certificate(_input: String) -> Result<CertificateInfo, String> {
    Err("尚未实现".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PEM: &str = r"-----BEGIN CERTIFICATE-----
MIID2TCCAsGgAwIBAgIUen4jqLHX2bpcAZlSmmZ3RmUYl9AwDQYJKoZIhvcNAQEL
BQAwbDELMAkGA1UEBhMCQ04xEDAOBgNVBAgMB0JlaWppbmcxEDAOBgNVBAcMB0Jl
aWppbmcxETAPBgNVBAoMCERldlV0aWxzMQ4wDAYDVQQLDAVUb29sczEWMBQGA1UE
AwwNZGV2dXRpbHMudGVzdDAeFw0yNjA5MjgwNjM5NDdaFw0zNjA5MjUwNjM5NDda
MGwxCzAJBgNVBAYTAkNOMRAwDgYDVQQIDAdCZWlqaW5nMRAwDgYDVQQHDAdCZWlq
aW5nMREwDwYDVQQKDAhEZXZVdGlsczEOMAwGA1UECwwFVG9vbHMxFjAUBgNVBAMM
DWRldnV0aWxzLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCr
7WpKUUbLqF9KH16ec2OvKAfJOmilQSwHHNKFrTmjGw5jWMYySnV1AmiV1rpvQB14
soST13Vp3u2abbECJge0TGEZP6/XKNGiY+Rj6AXq3TUkGKDHA+scsyBUMoPmqVCe
z9s+c0SjZr781V+KF+wwUI+Y2KJ92en9Ps8Dl2c+JOLsMpi05H8cETfoELT1LQOf
UmcaZeB5boV2zPN1OUIloPDhk8bAnOZ2Kd/iuRDNZDsuLLR7WQb2sLMI9NoO+QKM
F9ppj9rQTQ6Ce+0Me80K5xvK4J7MPJGO78Zd5uVc1KKA7zNy6kv/MGrqI/FWjlmM
zFnuDpfBBBuG1YHVjknvAgMBAAGjczBxMB0GA1UdDgQWBBRSw4ST7XHAEviLxhN3
G8C/QNT0EDAfBgNVHSMEGDAWgBRSw4ST7XHAEviLxhN3G8C/QNT0EDAPBgNVHRMB
Af8EBTADAQH/MB4GA1UdEQQXMBWCDWRldnV0aWxzLnRlc3SHBH8AAAEwDQYJKoZI
hvcNAQELBQADggEBAFcXprEnOxAiawjYQwuGLUEyUx3Pe5cHrs1XndoCVNiZa7OH
U/AtI1xPcQVljSZFraYvn0VkZT0p1k8wOmVuKqVmX2XzXp2af4mCzRNAeGiu5JKS
oJ0LBqTzzy9kqMT68fL6Ow/MzQlWiRbBZrFKyXkcwy5URe0wGOTT8EXDmFh1g8kU
pYEKyxI9Y4hHb/KbvHkV1ODfIEvjwlqmFZybPglAMUqVyKEgf7F9xfY2koGE0f9/
oshiEx4Jh+P+yYKx+K87gvDY4xJlVX206k+6AcO6FTpSE2GIsj68xjKsMYSPFWY4
T8PZ78fO6v6n2fkBld9KjX1CCmzdDJ60tvc6vA4=
-----END CERTIFICATE-----
";

    const EXPECTED_SERIAL: &str = "7A7E23A8B1D7D9BA5C0199529A667746651897D0";
    const EXPECTED_SHA1: &str = "E4:9A:F4:3E:20:84:A8:D1:E0:66:96:43:7B:06:39:7C:11:8C:93:CD";
    const EXPECTED_SHA256: &str =
        "53:4F:A2:1D:42:B4:4D:1D:E7:2C:D7:08:88:CF:D3:22:4C:22:11:91:BA:88:71:33:6D:E0:3D:2C:BA:83:11:8E";

    #[test]
    fn parses_pem_certificate() {
        let info = parse_certificate(SAMPLE_PEM.to_string()).unwrap();
        assert_eq!(info.subject.common_name.as_deref(), Some("devutils.test"));
        assert_eq!(info.issuer.common_name.as_deref(), Some("devutils.test"));
        assert_eq!(info.version, "v3");
        assert_eq!(info.serial_hex, EXPECTED_SERIAL);
        assert_eq!(info.fingerprints.sha1, EXPECTED_SHA1);
        assert_eq!(info.fingerprints.sha256, EXPECTED_SHA256);
        assert!(info.self_signed);
        assert!(info.is_ca);
        assert!(!info.is_expired);
        assert_eq!(info.public_key_algorithm, "1.2.840.113549.1.1.1");
        assert_eq!(info.public_key_bits, Some(2048));
        assert_eq!(info.subject.organization, vec!["DevUtils".to_string()]);
        assert_eq!(info.subject.country, vec!["CN".to_string()]);
        assert!(info.subject_alt_names.contains(&"DNS:devutils.test".to_string()));
        assert!(info.subject_alt_names.contains(&"IP:127.0.0.1".to_string()));
    }

    #[test]
    fn hex_and_base64_inputs_match_pem() {
        let from_pem = parse_certificate(SAMPLE_PEM.to_string()).unwrap();
        let der = hex::decode(&from_pem.der_hex).unwrap();
        let from_hex = parse_certificate(hex::encode(&der)).unwrap();
        let from_base64 =
            parse_certificate(base64::engine::general_purpose::STANDARD.encode(&der)).unwrap();
        assert_eq!(from_pem, from_hex);
        assert_eq!(from_pem, from_base64);
    }

    #[test]
    fn rejects_invalid_input() {
        assert!(parse_certificate(String::new()).is_err());
        assert!(parse_certificate("not a certificate".to_string()).is_err());
        let broken = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";
        assert!(parse_certificate(broken.to_string()).is_err());
    }
}
```

在 `src-tauri/src/commands/mod.rs` 追加一行（放在 `pub mod file;` 之后）：

```rust
pub mod x509;
```

在 `src-tauri/src/lib.rs` 的 `generate_handler!` 列表里，`commands::file::save_binary_file,` 之后追加：

```rust
            commands::x509::parse_certificate,
```

- [ ] **Step 5: 运行测试确认失败**

```bash
cargo test --manifest-path src-tauri/Cargo.toml x509
```

Expected：`parses_pem_certificate` 与 `hex_and_base64_inputs_match_pem` 两个用例 FAIL（panic 信息里带 `尚未实现`）；`rejects_invalid_input` 会通过（桩函数对所有输入都返回 `Err`）。桩阶段编译期会有 `unused import` 之类的 warning，属预期；Step 7 的 clippy 在实现完成后运行。

- [ ] **Step 6: 实现解析逻辑**

把 `src-tauri/src/commands/x509.rs` 中 `parse_certificate` 的桩函数替换为下列完整实现（保留文件顶部的 `use` 与结构体定义，把 `Err("尚未实现".into())` 那一行删掉）：

```rust
const PEM_BEGIN: &str = "-----BEGIN CERTIFICATE-----";

fn base64_flexible(text: &str) -> Result<Vec<u8>, ()> {
    let normalized: String = text
        .chars()
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            other => other,
        })
        .collect();
    let padded = match normalized.len() % 4 {
        2 => format!("{normalized}=="),
        3 => format!("{normalized}="),
        _ => normalized,
    };
    base64::engine::general_purpose::STANDARD
        .decode(padded)
        .map_err(|_| ())
}

fn decode_input(input: &str) -> Result<Vec<u8>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("请输入证书内容".into());
    }
    if trimmed.contains(PEM_BEGIN) {
        let body: String = trimmed
            .lines()
            .filter(|line| !line.trim_start().starts_with("-----"))
            .collect::<Vec<_>>()
            .join("");
        return base64_flexible(&body).map_err(|_| "PEM 内容解码失败：Base64 非法".to_string());
    }
    let compact: String = trimmed
        .chars()
        .filter(|c| !c.is_whitespace() && *c != ':')
        .collect();
    if compact.len() >= 64
        && compact.len() % 2 == 0
        && compact.chars().all(|c| c.is_ascii_hexdigit())
    {
        return hex::decode(&compact).map_err(|_| "DER(hex) 解码失败".to_string());
    }
    base64_flexible(&compact)
        .map_err(|_| "无法识别的证书格式：请粘贴 PEM、DER(hex) 或 Base64".to_string())
}

macro_rules! collect_attrs {
    ($iter:expr) => {
        $iter
            .filter_map(|attr| attr.as_str().ok().map(|s| s.to_owned()))
            .collect::<Vec<String>>()
    };
}

fn name_fields(name: &X509Name<'_>) -> NameFields {
    NameFields {
        common_name: name
            .iter_common_name()
            .next()
            .and_then(|attr| attr.as_str().ok())
            .map(|s| s.to_owned()),
        organization: collect_attrs!(name.iter_organization()),
        organizational_unit: collect_attrs!(name.iter_organizational_unit()),
        country: collect_attrs!(name.iter_country()),
        state: collect_attrs!(name.iter_state_or_province()),
        locality: collect_attrs!(name.iter_locality()),
        email: collect_attrs!(name.iter_email()),
        raw: name.to_string(),
    }
}

fn format_ip(bytes: &[u8]) -> String {
    match bytes.len() {
        4 => std::net::Ipv4Addr::new(bytes[0], bytes[1], bytes[2], bytes[3]).to_string(),
        16 => {
            let mut octets = [0u8; 16];
            octets.copy_from_slice(bytes);
            std::net::Ipv6Addr::from(octets).to_string()
        }
        _ => hex::encode(bytes),
    }
}

fn colon_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(":")
}

fn to_pem(der: &[u8]) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(der);
    let mut out = String::from(PEM_BEGIN);
    out.push('\n');
    for chunk in encoded.as_bytes().chunks(64) {
        out.push_str(std::str::from_utf8(chunk).unwrap_or_default());
        out.push('\n');
    }
    out.push_str("-----END CERTIFICATE-----\n");
    out
}

// 不直接引用 time crate（它不是本项目的依赖）：调用方传入 unix 秒，值来自 to_datetime()
fn to_rfc3339(unix_seconds: i64) -> String {
    chrono::DateTime::from_timestamp(unix_seconds, 0)
        .map(|value| value.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .unwrap_or_default()
}

#[tauri::command]
pub fn parse_certificate(input: String) -> Result<CertificateInfo, String> {
    let der = decode_input(&input)?;
    let (_, cert) =
        X509Certificate::from_der(&der).map_err(|err| format!("DER 解析失败：{err}"))?;

    let validity = cert.validity();
    let not_before_dt = validity.not_before.to_datetime();
    let not_after_dt = validity.not_after.to_datetime();
    let not_after_ts = not_after_dt.unix_timestamp();
    let now_ts = chrono::Utc::now().timestamp();
    let days_remaining = (not_after_ts - now_ts).div_euclid(86_400);

    let mut subject_alt_names = Vec::new();
    if let Ok(Some(ext)) = cert.subject_alternative_name() {
        for name in &ext.value.general_names {
            subject_alt_names.push(match name {
                GeneralName::DNSName(value) => format!("DNS:{value}"),
                GeneralName::RFC822Name(value) => format!("email:{value}"),
                GeneralName::URI(value) => format!("URI:{value}"),
                GeneralName::IPAddress(bytes) => format!("IP:{}", format_ip(bytes)),
                GeneralName::DirectoryName(value) => format!("DirName:{value}"),
                GeneralName::RegisteredID(oid) => format!("RID:{}", oid.to_id_string()),
                other => format!("其他:{other:?}"),
            });
        }
    }

    let mut key_usage = Vec::new();
    if let Ok(Some(ext)) = cert.key_usage() {
        let usage = ext.value;
        let flags = [
            (usage.digital_signature(), "digitalSignature"),
            (usage.non_repudiation(), "contentCommitment"),
            (usage.key_encipherment(), "keyEncipherment"),
            (usage.data_encipherment(), "dataEncipherment"),
            (usage.key_agreement(), "keyAgreement"),
            (usage.key_cert_sign(), "keyCertSign"),
            (usage.crl_sign(), "cRLSign"),
        ];
        for (present, label) in flags {
            if present {
                key_usage.push(label.to_string());
            }
        }
    }

    let mut extended_key_usage = Vec::new();
    if let Ok(Some(ext)) = cert.extended_key_usage() {
        let usage = ext.value;
        let flags = [
            (usage.any, "any"),
            (usage.server_auth, "serverAuth"),
            (usage.client_auth, "clientAuth"),
            (usage.code_signing, "codeSigning"),
            (usage.email_protection, "emailProtection"),
            (usage.time_stamping, "timeStamping"),
            (usage.ocsp_signing, "ocspSigning"),
        ];
        for (present, label) in flags {
            if present {
                extended_key_usage.push(label.to_string());
            }
        }
        for oid in &usage.other {
            extended_key_usage.push(oid.to_id_string());
        }
    }

    let mut is_ca = false;
    let mut path_len_constraint = None;
    if let Ok(Some(ext)) = cert.basic_constraints() {
        is_ca = ext.value.ca;
        path_len_constraint = ext.value.path_len_constraint;
    }

    let mut sha1_hasher = sha1::Sha1::new();
    sha1_hasher.update(&der);
    let mut sha256_hasher = sha2::Sha256::new();
    sha256_hasher.update(&der);

    let spki = cert.public_key();
    let public_key_bits = spki
        .parsed()
        .ok()
        .map(|key| key.key_size())
        .filter(|size| *size > 0)
        .map(|size| size as u32);

    Ok(CertificateInfo {
        subject: name_fields(cert.subject()),
        issuer: name_fields(cert.issuer()),
        serial_hex: hex::encode_upper(cert.raw_serial()),
        version: match cert.version().0 {
            0 => "v1",
            1 => "v2",
            _ => "v3",
        }
        .to_string(),
        not_before: to_rfc3339(not_before_dt.unix_timestamp()),
        not_after: to_rfc3339(not_after_dt.unix_timestamp()),
        days_remaining,
        is_expired: not_after_ts < now_ts,
        signature_algorithm: cert.signature_algorithm.algorithm.to_id_string(),
        public_key_algorithm: spki.algorithm.algorithm.to_id_string(),
        public_key_bits,
        subject_alt_names,
        key_usage,
        extended_key_usage,
        is_ca,
        path_len_constraint,
        self_signed: cert.subject().as_raw() == cert.issuer().as_raw(),
        fingerprints: Fingerprints {
            sha1: colon_hex(&sha1_hasher.finalize()),
            sha256: colon_hex(&sha256_hasher.finalize()),
        },
        der_hex: hex::encode_upper(&der),
        pem: to_pem(&der),
    })
}
```

实现完成后必须满足：`use sha2::Digest;` 提供的 `update` / `finalize` 同时作用于 `sha1::Sha1` 与 `sha2::Sha256`（与 `commands/hash.rs` 的写法一致）。

- [ ] **Step 7: 运行 Rust 测试与 clippy**

```bash
cargo test --manifest-path src-tauri/Cargo.toml x509
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected：3 个 `commands::x509::tests` 用例 PASS，clippy 无 warning。

- [ ] **Step 8: 前端回归与构建**

```bash
npm test
npm run build
```

Expected：既有 321 个用例 + 无新增前端用例，全部 PASS；`vue-tsc` 无报错；`dist/assets/` 下能看到 `X509-*.js` 与 `Qrcode-*.js` 两个 chunk。

- [ ] **Step 9: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands/x509.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs package.json package-lock.json src/types/tool.ts src/App.vue src/views/tools/X509/X509.vue src/views/tools/Qrcode/Qrcode.vue
git commit -m "feat(phase3-d): 安装依赖、注册两个工具并新增 Rust 证书解析命令"
```

---

### Task 2: `x509` 视图与展示层纯函数

**Files:**
- Create: `src/views/tools/X509/utils/certView.ts`
- Create: `src/views/tools/X509/utils/parseCert.ts`
- Create: `src/views/tools/X509/__tests__/certView.spec.ts`
- Modify: `src/views/tools/X509/X509.vue`（替换占位实现）

**Interfaces:**
- Consumes: Task 1 的 `parse_certificate` 命令
- Produces:
  - `expiryLevel(daysRemaining: number): 'ok' | 'soon' | 'expired'`
  - `formatFingerprint(hex: string): string`
  - `formatPublicKey(algorithm: string, bits: number | null): string`
  - `oidLabel(oid: string): string`
  - `parseCertificate(input: string): Promise<CertificateInfo>`

- [ ] **Step 1: 写失败的展示层测试**

创建 `src/views/tools/X509/__tests__/certView.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { expiryLevel, formatFingerprint, formatPublicKey, oidLabel } from '../utils/certView'

describe('certView', () => {
  it('按剩余天数划分有效期状态', () => {
    expect(expiryLevel(-1)).toBe('expired')
    expect(expiryLevel(0)).toBe('soon')
    expect(expiryLevel(30)).toBe('soon')
    expect(expiryLevel(31)).toBe('ok')
  })

  it('指纹按大写冒号分隔展示', () => {
    expect(formatFingerprint('aabbcc')).toBe('AA:BB:CC')
    expect(formatFingerprint('')).toBe('')
  })

  it('公钥展示包含算法名与位数', () => {
    expect(formatPublicKey('1.2.840.113549.1.1.1', 2048)).toBe('RSA · 2048 bit')
    expect(formatPublicKey('1.2.840.10045.2.1', null)).toBe('EC')
  })

  it('OID 命中映射表时返回可读名，否则原样回落', () => {
    expect(oidLabel('1.2.840.113549.1.1.11')).toBe('SHA256withRSA')
    expect(oidLabel('1.3.101.112')).toBe('Ed25519')
    expect(oidLabel('9.9.9.9')).toBe('9.9.9.9')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/views/tools/X509
```

Expected：FAIL，报无法解析 `../utils/certView`。

- [ ] **Step 3: 实现 `certView.ts`**

创建 `src/views/tools/X509/utils/certView.ts`：

```ts
export type ExpiryLevel = 'ok' | 'soon' | 'expired'

const OID_LABELS: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.5': 'SHA1withRSA',
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10045.4.3.2': 'ECDSA-with-SHA256',
  '1.3.101.112': 'Ed25519'
}

const SOON_THRESHOLD_DAYS = 30

export function expiryLevel(daysRemaining: number): ExpiryLevel {
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= SOON_THRESHOLD_DAYS) return 'soon'
  return 'ok'
}

export function formatFingerprint(hex: string): string {
  const compact = hex.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (!compact) return ''
  return compact.match(/.{1,2}/g)?.join(':') ?? ''
}

export function formatPublicKey(algorithm: string, bits: number | null): string {
  const label = oidLabel(algorithm)
  return bits && bits > 0 ? `${label} · ${bits} bit` : label
}

export function oidLabel(oid: string): string {
  return OID_LABELS[oid] ?? oid
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/views/tools/X509
```

Expected：PASS（4 个用例）。

- [ ] **Step 5: 实现 `parseCert.ts`**

创建 `src/views/tools/X509/utils/parseCert.ts`：

```ts
import { invoke } from '@tauri-apps/api/core'

export interface NameFields {
  commonName?: string
  organization: string[]
  organizationalUnit: string[]
  country: string[]
  state: string[]
  locality: string[]
  email: string[]
  raw: string
}

export interface Fingerprints {
  sha1: string
  sha256: string
}

export interface CertificateInfo {
  subject: NameFields
  issuer: NameFields
  serialHex: string
  version: string
  notBefore: string
  notAfter: string
  daysRemaining: number
  isExpired: boolean
  signatureAlgorithm: string
  publicKeyAlgorithm: string
  publicKeyBits: number | null
  subjectAltNames: string[]
  keyUsage: string[]
  extendedKeyUsage: string[]
  isCa: boolean
  pathLenConstraint: number | null
  selfSigned: boolean
  fingerprints: Fingerprints
  derHex: string
  pem: string
}

export function parseCertificate(input: string): Promise<CertificateInfo> {
  return invoke<CertificateInfo>('parse_certificate', { input })
}
```

- [ ] **Step 6: 实现视图**

把 `src/views/tools/X509/X509.vue` 全文替换为：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { parseCertificate, type CertificateInfo } from './utils/parseCert'
import { expiryLevel, formatFingerprint, formatPublicKey, oidLabel } from './utils/certView'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const SAMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIID2TCCAsGgAwIBAgIUen4jqLHX2bpcAZlSmmZ3RmUYl9AwDQYJKoZIhvcNAQEL
BQAwbDELMAkGA1UEBhMCQ04xEDAOBgNVBAgMB0JlaWppbmcxEDAOBgNVBAcMB0Jl
aWppbmcxETAPBgNVBAoMCERldlV0aWxzMQ4wDAYDVQQLDAVUb29sczEWMBQGA1UE
AwwNZGV2dXRpbHMudGVzdDAeFw0yNjA5MjgwNjM5NDdaFw0zNjA5MjUwNjM5NDda
MGwxCzAJBgNVBAYTAkNOMRAwDgYDVQQIDAdCZWlqaW5nMRAwDgYDVQQHDAdCZWlq
aW5nMREwDwYDVQQKDAhEZXZVdGlsczEOMAwGA1UECwwFVG9vbHMxFjAUBgNVBAMM
DWRldnV0aWxzLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCr
7WpKUUbLqF9KH16ec2OvKAfJOmilQSwHHNKFrTmjGw5jWMYySnV1AmiV1rpvQB14
soST13Vp3u2abbECJge0TGEZP6/XKNGiY+Rj6AXq3TUkGKDHA+scsyBUMoPmqVCe
z9s+c0SjZr781V+KF+wwUI+Y2KJ92en9Ps8Dl2c+JOLsMpi05H8cETfoELT1LQOf
UmcaZeB5boV2zPN1OUIloPDhk8bAnOZ2Kd/iuRDNZDsuLLR7WQb2sLMI9NoO+QKM
F9ppj9rQTQ6Ce+0Me80K5xvK4J7MPJGO78Zd5uVc1KKA7zNy6kv/MGrqI/FWjlmM
zFnuDpfBBBuG1YHVjknvAgMBAAGjczBxMB0GA1UdDgQWBBRSw4ST7XHAEviLxhN3
G8C/QNT0EDAfBgNVHSMEGDAWgBRSw4ST7XHAEviLxhN3G8C/QNT0EDAPBgNVHRMB
Af8EBTADAQH/MB4GA1UdEQQXMBWCDWRldnV0aWxzLnRlc3SHBH8AAAEwDQYJKoZI
hvcNAQELBQADggEBAFcXprEnOxAiawjYQwuGLUEyUx3Pe5cHrs1XndoCVNiZa7OH
U/AtI1xPcQVljSZFraYvn0VkZT0p1k8wOmVuKqVmX2XzXp2af4mCzRNAeGiu5JKS
oJ0LBqTzzy9kqMT68fL6Ow/MzQlWiRbBZrFKyXkcwy5URe0wGOTT8EXDmFh1g8kU
pYEKyxI9Y4hHb/KbvHkV1ODfIEvjwlqmFZybPglAMUqVyKEgf7F9xfY2koGE0f9/
oshiEx4Jh+P+yYKx+K87gvDY4xJlVX206k+6AcO6FTpSE2GIsj68xjKsMYSPFWY4
T8PZ78fO6v6n2fkBld9KjX1CCmzdDJ60tvc6vA4=
-----END CERTIFICATE-----
`

const EXPIRY_TEXT: Record<string, string> = {
  ok: '有效',
  soon: '30 天内到期',
  expired: '已过期'
}

const input = ref<string>(props.initialSnapshot?.input ?? '')
const info = ref<CertificateInfo | null>(null)
const errorMessage = ref<string>('')
const loading = ref(false)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const badgeLevel = computed(() => (info.value ? expiryLevel(info.value.daysRemaining) : 'ok'))
const badgeText = computed(() => EXPIRY_TEXT[badgeLevel.value])
const badgeClass = computed(() => {
  if (badgeLevel.value === 'expired') {
    return 'px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
  }
  if (badgeLevel.value === 'soon') {
    return 'px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  }
  return 'px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
})

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: input.value })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

async function parse() {
  const text = input.value.trim()
  if (!text) {
    info.value = null
    errorMessage.value = ''
    return
  }
  loading.value = true
  try {
    info.value = await parseCertificate(text)
    errorMessage.value = ''
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

function fillSample() {
  input.value = SAMPLE_CERT
  parse()
}

function clearAll() {
  input.value = ''
  info.value = null
  errorMessage.value = ''
}

function copyText(text: string, label: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success(label)
}

watch(input, scheduleSnapshot)

onMounted(() => {
  if (input.value.trim()) parse()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">X.509 证书解析</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">支持 PEM / DER(hex) / Base64，解析主体、有效期、扩展与指纹</p>
      </div>
      <div class="flex items-center gap-2">
        <NButton size="small" @click="fillSample">填入示例证书</NButton>
        <NButton size="small" @click="clearAll">清空</NButton>
        <NButton size="small" type="primary" :loading="loading" @click="parse">解析</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">证书内容</div>
        <textarea
          v-model="input"
          class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none"
          placeholder="粘贴 PEM、DER(hex) 或 Base64"
        ></textarea>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">解析结果</span>
          <div class="flex items-center gap-2">
            <NButton v-if="info" size="tiny" @click="copyText(info.pem, '已复制 PEM')">复制 PEM</NButton>
            <NButton v-if="info" size="tiny" @click="copyText(info.fingerprints.sha256, '已复制 SHA-256')">复制 SHA-256</NButton>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs">
          <p v-if="!info" class="text-slate-400">粘贴证书后点「解析」</p>
          <template v-else>
            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="flex items-center justify-between">
                <span class="font-medium">概要</span>
                <span :class="badgeClass">{{ badgeText }}</span>
              </div>
              <div>Subject CN：{{ info.subject.commonName || '-' }}</div>
              <div>Issuer CN：{{ info.issuer.commonName || '-' }}</div>
              <div>有效期：{{ info.notBefore }} → {{ info.notAfter }}</div>
              <div>剩余天数：{{ info.daysRemaining }}</div>
              <div>序列号：<span class="font-mono break-all">{{ info.serialHex }}</span></div>
              <div>版本：{{ info.version }}<span v-if="info.selfSigned"> · 自签</span></div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">主体 / 签发者</div>
              <div>Subject DN：<span class="font-mono break-all">{{ info.subject.raw }}</span></div>
              <div>Issuer DN：<span class="font-mono break-all">{{ info.issuer.raw }}</span></div>
              <div>O：{{ info.subject.organization.join(', ') || '-' }}</div>
              <div>OU：{{ info.subject.organizationalUnit.join(', ') || '-' }}</div>
              <div>C / ST / L：{{ info.subject.country.join(', ') || '-' }} / {{ info.subject.state.join(', ') || '-' }} / {{ info.subject.locality.join(', ') || '-' }}</div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">公钥与签名</div>
              <div>公钥：{{ formatPublicKey(info.publicKeyAlgorithm, info.publicKeyBits) }}</div>
              <div>签名算法：{{ oidLabel(info.signatureAlgorithm) }}</div>
              <div>CA：{{ info.isCa ? '是' : '否' }}<span v-if="info.pathLenConstraint !== null"> · pathLen={{ info.pathLenConstraint }}</span></div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">扩展</div>
              <div>SAN：{{ info.subjectAltNames.join('  |  ') || '-' }}</div>
              <div>Key Usage：{{ info.keyUsage.join(', ') || '-' }}</div>
              <div>Extended Key Usage：{{ info.extendedKeyUsage.join(', ') || '-' }}</div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">指纹</div>
              <div class="font-mono break-all">SHA-1：{{ formatFingerprint(info.fingerprints.sha1) }}</div>
              <div class="font-mono break-all">SHA-256：{{ formatFingerprint(info.fingerprints.sha256) }}</div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 7: 类型检查与构建**

```bash
npm test
npm run build
```

Expected：全绿；`vue-tsc` 无报错。

- [ ] **Step 8: 提交**

```bash
git add src/views/tools/X509
git commit -m "feat(x509): 新增 X.509 证书解析视图与展示层纯函数"
```

---

### Task 3: `qrcode` 纯函数（参数规整 / 对比度 / 解码）

**Files:**
- Create: `src/views/tools/Qrcode/utils/qrOptions.ts`
- Create: `src/views/tools/Qrcode/utils/decodeQr.ts`
- Create: `src/views/tools/Qrcode/__tests__/qrOptions.spec.ts`
- Create: `src/views/tools/Qrcode/__tests__/decodeQr.spec.ts`
- Create: `src/views/tools/Qrcode/__tests__/fixtures/qrMatrix.ts`

**Interfaces:**
- Consumes: 无（`jsqr` 是 Task 1 装好的依赖）
- Produces:
  - `normalizeQrOptions(partial?: Partial<QrOptions>): QrOptions`
  - `contrastRatio(fg: string, bg: string): number`
  - `decodeQr(image: { data: Uint8ClampedArray; width: number; height: number }): { text: string; version: number; bytes: number } | null`
  - `DEFAULT_QR_OPTIONS`、类型 `QrEcc`、`QrOptions`

- [ ] **Step 1: 写失败的测试**

创建 `src/views/tools/Qrcode/__tests__/fixtures/qrMatrix.ts`（矩阵来自一次性脚本 `QRCode.create('DEVUTILS-1', { errorCorrectionLevel: 'M' })` 的 `modules` 输出，**测试运行时不依赖 `qrcode`**）：

```ts
export const QR_FIXTURE_TEXT = 'DEVUTILS-1'
export const QR_FIXTURE_SIZE = 21
export const QR_FIXTURE_ROWS = [
  '111111100001101111111',
  '100000101101001000001',
  '101110101101101011101',
  '101110101001001011101',
  '101110100110101011101',
  '100000100011001000001',
  '111111101010101111111',
  '000000001100000000000',
  '100000101111011001110',
  '001111001101110010010',
  '111011100100101101010',
  '000110011001111010110',
  '100001110001111011001',
  '000000001010100110101',
  '111111100101010101000',
  '100000100010001101111',
  '101110100101010010110',
  '101110100001111010000',
  '101110100111110011011',
  '100000100111111011001',
  '111111101100100011100'
]

export function qrFixturePixels(scale = 8, quietZone = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const modules = QR_FIXTURE_SIZE + quietZone * 2
  const width = modules * scale
  const height = width
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  for (let y = 0; y < QR_FIXTURE_SIZE; y++) {
    for (let x = 0; x < QR_FIXTURE_SIZE; x++) {
      if (QR_FIXTURE_ROWS[y][x] !== '1') continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (quietZone + x) * scale + dx
          const py = (quietZone + y) * scale + dy
          const offset = (py * width + px) * 4
          data[offset] = 0
          data[offset + 1] = 0
          data[offset + 2] = 0
          data[offset + 3] = 255
        }
      }
    }
  }
  return { data, width, height }
}
```

创建 `src/views/tools/Qrcode/__tests__/qrOptions.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_QR_OPTIONS, contrastRatio, normalizeQrOptions } from '../utils/qrOptions'

describe('normalizeQrOptions', () => {
  it('越界尺寸被钳制到边界', () => {
    expect(normalizeQrOptions({ size: 64 }).size).toBe(128)
    expect(normalizeQrOptions({ size: 4096 }).size).toBe(1024)
  })

  it('边距越界被钳制，小数被取整', () => {
    expect(normalizeQrOptions({ margin: -3 }).margin).toBe(0)
    expect(normalizeQrOptions({ margin: 99 }).margin).toBe(8)
    expect(normalizeQrOptions({ margin: 3.6 }).margin).toBe(4)
  })

  it('非法颜色与非法纠错等级回落默认值', () => {
    expect(normalizeQrOptions({ fg: 'red' }).fg).toBe(DEFAULT_QR_OPTIONS.fg)
    expect(normalizeQrOptions({ bg: '' }).bg).toBe(DEFAULT_QR_OPTIONS.bg)
    expect(normalizeQrOptions({ ecc: 'X' as never }).ecc).toBe('M')
  })

  it('颜色统一归一化为大写 #RRGGBB', () => {
    expect(normalizeQrOptions({ fg: '00ff00' }).fg).toBe('#00FF00')
    expect(normalizeQrOptions({ bg: '#abcdef' }).bg).toBe('#ABCDEF')
  })

  it('空对象返回默认值', () => {
    expect(normalizeQrOptions()).toEqual(DEFAULT_QR_OPTIONS)
  })
})

describe('contrastRatio', () => {
  it('黑白对比度为 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('同色对比度为 1', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
})
```

创建 `src/views/tools/Qrcode/__tests__/decodeQr.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { decodeQr } from '../utils/decodeQr'
import { QR_FIXTURE_TEXT, qrFixturePixels } from './fixtures/qrMatrix'

describe('decodeQr', () => {
  it('能从像素缓冲里解出二维码文本', () => {
    const result = decodeQr(qrFixturePixels())
    expect(result).not.toBeNull()
    expect(result?.text).toBe(QR_FIXTURE_TEXT)
    expect(result?.version).toBe(1)
    expect(result?.bytes).toBe(QR_FIXTURE_TEXT.length)
  })

  it('纯白图片返回 null', () => {
    const width = 64
    const height = 64
    const data = new Uint8ClampedArray(width * height * 4)
    data.fill(255)
    expect(decodeQr({ data, width, height })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/views/tools/Qrcode
```

Expected：FAIL，报无法解析 `../utils/qrOptions` 与 `../utils/decodeQr`。

- [ ] **Step 3: 实现 `qrOptions.ts`**

创建 `src/views/tools/Qrcode/utils/qrOptions.ts`：

```ts
export type QrEcc = 'L' | 'M' | 'Q' | 'H'

export interface QrOptions {
  ecc: QrEcc
  size: number
  margin: number
  fg: string
  bg: string
}

export const DEFAULT_QR_OPTIONS: QrOptions = {
  ecc: 'M',
  size: 256,
  margin: 2,
  fg: '#000000',
  bg: '#FFFFFF'
}

const ECC_VALUES: QrEcc[] = ['L', 'M', 'Q', 'H']
const HEX_RE = /^#?([0-9a-fA-F]{6})$/

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const match = HEX_RE.exec(value.trim())
  return match ? `#${match[1].toUpperCase()}` : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

export function normalizeQrOptions(partial: Partial<QrOptions> = {}): QrOptions {
  const ecc = ECC_VALUES.includes(partial.ecc as QrEcc) ? (partial.ecc as QrEcc) : DEFAULT_QR_OPTIONS.ecc
  return {
    ecc,
    size: clampInt(partial.size, 128, 1024, DEFAULT_QR_OPTIONS.size),
    margin: clampInt(partial.margin, 0, 8, DEFAULT_QR_OPTIONS.margin),
    fg: normalizeHex(partial.fg, DEFAULT_QR_OPTIONS.fg),
    bg: normalizeHex(partial.bg, DEFAULT_QR_OPTIONS.bg)
  }
}

function srgbChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex, '#000000')
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
}

export function contrastRatio(fg: string, bg: string): number {
  const first = relativeLuminance(fg)
  const second = relativeLuminance(bg)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
```

- [ ] **Step 4: 实现 `decodeQr.ts`**

创建 `src/views/tools/Qrcode/utils/decodeQr.ts`：

```ts
import jsQR from 'jsqr'

export interface QrImageData {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface QrDecodeResult {
  text: string
  version: number
  bytes: number
}

export function decodeQr(image: QrImageData): QrDecodeResult | null {
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
  if (!result || !result.data) return null
  return {
    text: result.data,
    version: result.version,
    bytes: new TextEncoder().encode(result.data).length
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run src/views/tools/Qrcode
```

Expected：PASS（7 个用例）。

- [ ] **Step 6: 类型检查与提交**

```bash
npm test
npm run build
git add src/views/tools/Qrcode
git commit -m "feat(qrcode): 新增二维码参数规整/对比度/解码纯函数及单测"
```

Expected：`npm test` 与 `npm run build` 全绿；提交成功。

---

### Task 4: `qrcode` 视图（生成 / 解码 / 导出）

**Files:**
- Modify: `src/views/tools/Qrcode/Qrcode.vue`（替换占位实现）

**Interfaces:**
- Consumes: Task 3 的 `normalizeQrOptions` / `contrastRatio` / `decodeQr` / `QrOptions`；Task 1 安装的 `qrcode`；批次 C 的 `saveBase64File`
- Produces: 视图，快照字段 `{ mode, text, ecc, size, margin, fg, bg, savePath }`

- [ ] **Step 1: 实现视图**

把 `src/views/tools/Qrcode/Qrcode.vue` 全文替换为：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NColorPicker, NInput, NInputNumber, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { toCanvas } from 'qrcode'
import { useTabStore } from '@/stores/tabStore'
import { saveBase64File } from '@/utils/fileSave'
import { contrastRatio, normalizeQrOptions, type QrEcc, type QrOptions } from './utils/qrOptions'
import { decodeQr, type QrDecodeResult } from './utils/decodeQr'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Mode = 'generate' | 'decode'

const MAX_DECODE_EDGE = 4096
const DEFAULT_SAVE_PATH = '~/Downloads/devutils-qrcode.png'
const ECC_OPTIONS: QrEcc[] = ['L', 'M', 'Q', 'H']

const mode = ref<Mode>(props.initialSnapshot?.mode === 'decode' ? 'decode' : 'generate')
const initialOptions = normalizeQrOptions({
  ecc: props.initialSnapshot?.ecc,
  size: props.initialSnapshot?.size,
  margin: props.initialSnapshot?.margin,
  fg: props.initialSnapshot?.fg,
  bg: props.initialSnapshot?.bg
})
const text = ref<string>(props.initialSnapshot?.text ?? '')
const ecc = ref<QrEcc>(initialOptions.ecc)
const size = ref<number>(initialOptions.size)
const margin = ref<number>(initialOptions.margin)
const fg = ref<string>(initialOptions.fg)
const bg = ref<string>(initialOptions.bg)
const savePath = ref<string>(props.initialSnapshot?.savePath ?? DEFAULT_SAVE_PATH)
const errorMessage = ref<string>('')
const generatedText = ref<string>('')
const decodeResult = ref<QrDecodeResult | null>(null)
const decodeError = ref<string>('')
const previewUrl = ref<string>('')
const canvasEl = ref<HTMLCanvasElement | null>(null)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const options = computed<QrOptions>(() =>
  normalizeQrOptions({ ecc: ecc.value, size: size.value, margin: margin.value, fg: fg.value, bg: bg.value })
)
const lowContrast = computed(() => contrastRatio(options.value.fg, options.value.bg) < 3)

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    mode: mode.value,
    text: text.value,
    ecc: options.value.ecc,
    size: options.value.size,
    margin: options.value.margin,
    fg: options.value.fg,
    bg: options.value.bg,
    savePath: savePath.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

async function generate() {
  const content = text.value
  if (!content) {
    generatedText.value = ''
    errorMessage.value = ''
    return
  }
  if (!canvasEl.value) return
  try {
    await toCanvas(canvasEl.value, content, {
      errorCorrectionLevel: options.value.ecc,
      width: options.value.size,
      margin: options.value.margin,
      color: { dark: options.value.fg, light: options.value.bg }
    })
    generatedText.value = content
    errorMessage.value = ''
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

function canvasToBase64(): string {
  const url = canvasEl.value?.toDataURL('image/png') ?? ''
  const comma = url.indexOf(',')
  return comma >= 0 ? url.slice(comma + 1) : ''
}

async function exportPng() {
  const base64 = canvasToBase64()
  if (!base64) {
    errorMessage.value = '请先生成二维码'
    return
  }
  const path = savePath.value.trim()
  if (!path) {
    errorMessage.value = '请填写保存路径'
    return
  }
  try {
    const bytes = await saveBase64File(path, base64)
    errorMessage.value = ''
    message.success(`已保存 ${bytes} 字节到 ${path}`)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

async function loadImageFile(file: File) {
  decodeError.value = ''
  decodeResult.value = null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      decodeError.value = '当前环境不支持 Canvas'
      return
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    previewUrl.value = canvas.toDataURL('image/png')
    const imageData = ctx.getImageData(0, 0, width, height)
    const result = decodeQr({ data: imageData.data, width, height })
    if (!result) {
      decodeError.value = '未识别到二维码，试试更清晰或更大的图片'
      return
    }
    decodeResult.value = result
  } catch {
    decodeError.value = '读取图片失败'
  }
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    event.preventDefault()
    loadImageFile(file)
  }
}

function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        event.preventDefault()
        loadImageFile(file)
        return
      }
    }
  }
}

function onPickFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) loadImageFile(file)
  target.value = ''
}

function copyText(value: string, label: string) {
  if (!value) return
  navigator.clipboard.writeText(value)
  message.success(label)
}

watch([mode, text, ecc, size, margin, fg, bg, savePath], scheduleSnapshot)
watch([text, ecc, size, margin, fg, bg], () => {
  if (mode.value === 'generate') generate()
})

onMounted(() => {
  if (mode.value === 'generate' && text.value) generate()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">二维码生成与解码</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">文本生成二维码，或粘贴/拖入图片解出二维码内容</p>
      </div>
      <NRadioGroup v-model:value="mode" size="small">
        <NRadioButton value="generate">生成</NRadioButton>
        <NRadioButton value="decode">解码</NRadioButton>
      </NRadioGroup>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-if="mode === 'generate' && lowContrast" type="warning" :bordered="false">前景与背景对比度过低，扫码可能失败</NAlert>
      <NAlert v-if="decodeError" type="warning" :bordered="false">{{ decodeError }}</NAlert>
    </div>

    <div v-if="mode === 'generate'" class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">内容</div>
          <textarea
            v-model="text"
            class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none"
            placeholder="https://example.com"
          ></textarea>
        </div>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0 space-y-2 text-xs">
          <div class="flex items-center gap-2">
            <span class="shrink-0">纠错等级</span>
            <NRadioGroup v-model:value="ecc" size="small">
              <NRadioButton v-for="level in ECC_OPTIONS" :key="level" :value="level">{{ level }}</NRadioButton>
            </NRadioGroup>
            <span class="shrink-0 ml-2">尺寸</span>
            <NInputNumber v-model:value="size" size="tiny" class="w-24" :min="128" :max="1024" :step="32" />
            <span class="shrink-0">边距</span>
            <NInputNumber v-model:value="margin" size="tiny" class="w-20" :min="0" :max="8" />
          </div>
          <div class="flex items-center gap-2">
            <span class="shrink-0">前景</span>
            <NColorPicker v-model:value="fg" size="small" :show-alpha="false" />
            <span class="shrink-0">背景</span>
            <NColorPicker v-model:value="bg" size="small" :show-alpha="false" />
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">预览与导出</span>
          <div class="flex items-center gap-2">
            <NButton v-if="generatedText" size="tiny" @click="copyText(canvasEl?.toDataURL('image/png') ?? '', '已复制 DataURL')">复制 DataURL</NButton>
            <NButton v-if="generatedText" size="tiny" type="primary" @click="exportPng">导出 PNG</NButton>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 flex flex-col items-center gap-3">
          <canvas ref="canvasEl" class="max-w-full h-auto border border-slate-200 dark:border-slate-800"></canvas>
          <p v-if="!generatedText" class="text-xs text-slate-400">输入内容后自动生成</p>
          <div class="w-full flex items-center gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">保存路径</span>
            <NInput v-model:value="savePath" size="small" class="flex-1" placeholder="~/Downloads/devutils-qrcode.png" />
          </div>
        </div>
      </section>
    </div>

    <div v-else class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <div
          class="flex-1 min-h-0 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-500"
          tabindex="0"
          @paste="onPaste"
          @drop="onDrop"
          @dragover.prevent
        >
          <span>点这里后按 Ctrl/Cmd+V 粘贴二维码图片，或把图片拖进来</span>
          <label class="text-indigo-600 dark:text-indigo-400 cursor-pointer">
            <input type="file" accept="image/*" class="hidden" @change="onPickFile" />
            或选择本地图片…
          </label>
        </div>
        <div class="shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 flex items-center justify-center min-h-[8rem]">
          <img v-if="previewUrl" :src="previewUrl" class="max-h-32 object-contain" alt="qr-source" />
          <span v-else class="text-xs text-slate-400">暂无图片</span>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">解码结果</span>
          <NButton v-if="decodeResult" size="tiny" @click="copyText(decodeResult.text, '已复制解码文本')">复制文本</NButton>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <p v-if="!decodeResult" class="text-xs text-slate-400">尚未解出内容</p>
          <template v-else>
            <pre class="text-xs font-mono break-all whitespace-pre-wrap">{{ decodeResult.text }}</pre>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">版本 {{ decodeResult.version }} · {{ decodeResult.bytes }} 字节</p>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

```bash
npm test
npm run build
```

Expected：`vue-tsc --noEmit` 无报错，产出 `dist/assets/Qrcode-*.js`。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/Qrcode/Qrcode.vue
git commit -m "feat(qrcode): 新增二维码生成与解码视图"
```

---

### Task 5: 全量回归与验收

**Files:** 无新增（只跑验证；若发现回归，修正对应任务的文件后重跑）

- [ ] **Step 1: 前端全量测试与构建**

```bash
npm test
npm run build
```

Expected：既有用例 + 批次 D 新增的 11 个用例全部 PASS；`vue-tsc` 无报错；`dist/assets/` 下能看到 `X509-*.js` 与 `Qrcode-*.js`。

- [ ] **Step 2: Rust 回归**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected：clippy 无 warning；全部测试通过（`test_http` 需在沙箱外重跑确认）。

- [ ] **Step 3: 约束核对**

```bash
# 批次起始提交 = 本计划的 spec 提交，用 git log 里的 “docs(spec): 新增第三阶段批次 D” 定位
BASE=$(git log --format=%H --grep="docs(spec): 新增第三阶段批次 D" -1)
git diff --stat "$BASE"..HEAD -- package.json src-tauri/Cargo.toml
git diff "$BASE"..HEAD -- src-tauri/src/lib.rs src-tauri/src/commands/mod.rs
cargo tree --manifest-path src-tauri/Cargo.toml | rg "ring|aws-lc" || echo "no ring/aws-lc (expected)"
```

Expected：`package.json` 只新增 `qrcode`、`jsqr`、`@types/qrcode`；`Cargo.toml` 只新增 `x509-parser`；`lib.rs` 与 `commands/mod.rs` 各只有一行新增；**不得出现 `ring` / `aws-lc-rs`**（用 `cargo tree --manifest-path src-tauri/Cargo.toml | rg "ring|aws-lc"` 应为空）。

- [ ] **Step 4: 浏览器验收（本地静态服务 + 无头 Chrome + 真实 CSP）**

复用批次 C 的验收套路（`dist` 产物 + 带真实 CSP 头的静态服务 + 无头 Chrome 经 CDP 驱动），必须断言：

1. 侧边栏点击 `X.509 证书解析` 打开真实视图，「填入示例证书」+「解析」后概要区出现 `devutils.test` 与「有效」徽标。
2. 同一张证书的 PEM 与 DER hex 两种输入解析出的概要一致。
3. 乱码输入后页面出现错误 `NAlert`，且不白屏（`document.body.innerText` 仍包含工具标题）。
4. 切换到 `二维码生成与解码`，内容填 `DEVUTILS-1`、纠错 M、尺寸 256，canvas 生成成功（`canvas.width === 256`）。
5. 生成模式：内容填 `DEVUTILS-1`、纠错 M、尺寸 256，保存路径填 `/tmp/devutils-qrcode-roundtrip.png`，点「导出 PNG」；随后用 CDP `DOM.setFileInputFiles` 把这个 PNG 塞进解码模式隐藏的 `<input type="file">`，断言右栏解出的文本等于 `DEVUTILS-1` 且版本为 1（同一张图既验证导出又验证解码闭环）。
6. 非二维码图片（纯白 PNG）走解码流程后出现「未识别到二维码」提示。
7. 两个工具关闭 Tab 再打开，输入与视图选项还原；解析结果与二维码图片不还原（符合设计）。
8. 控制台无未捕获异常。

- [ ] **Step 5: 保存命令的真机验证**

```bash
npm run tauri -- build --debug
```

启动 `src-tauri/target/debug/bundle/macos/DevUtils.app`，在二维码工具里把保存路径填成 `/tmp/devutils-qrcode-test.png`，点「导出 PNG」，然后：

```bash
ls -l /tmp/devutils-qrcode-test.png && file /tmp/devutils-qrcode-test.png
```

Expected：文件存在、大小与界面提示的字节数一致、`file` 识别为 PNG image data。

- [ ] **Step 6: 确认提交历史与工作区状态**

```bash
git log --oneline -10
git status --short
```

Expected：看到本计划各任务的提交记录；工作区无未提交改动。

- [ ] **Step 7: 向用户汇报**

汇报内容：两个工具的实现范围、3 个新增依赖（含 `@types/qrcode`）与理由、`x509-parser` 未启用 `verify` 因而不引入 `ring` 的证据、证书三形态一致性实测结论、二维码生成/解码闭环实测结论、保存命令真机落盘证据，以及跑过的验证命令与结果。
