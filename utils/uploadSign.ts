// Функция для генерации подписи v4
export function generateSignatureV4(
	method: string,
	service: string,
	region: string,
	canonicalRequest: string,
	date: string,
) {
	const algorithm = 'AWS4-HMAC-SHA256';
	const credentialScope = `${date.substring(0, 8)}/${region}/${service}/aws4_request`;
	const stringToSign = `${algorithm}\n${date}\n${credentialScope}\n${sha256(canonicalRequest)}`;

	const kDate = hmacSHA256(`AWS4${secretAccessKey}`, date.substring(0, 8));
	const kRegion = hmacSHA256(kDate, region);
	const kService = hmacSHA256(kRegion, service);
	const kSigning = hmacSHA256(kService, 'aws4_request');

	return hexEncode(hmacSHA256(kSigning, stringToSign));
}
