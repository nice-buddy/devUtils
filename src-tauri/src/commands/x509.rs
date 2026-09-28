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
        && compact.len().is_multiple_of(2)
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
    let (_, cert) = X509Certificate::from_der(&der).map_err(|err| format!("DER 解析失败：{err}"))?;

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
