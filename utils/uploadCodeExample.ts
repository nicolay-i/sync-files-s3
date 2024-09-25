import * as https from 'https';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {requestUrl, RequestUrlParam} from "obsidian";

// Переменные для S3
const bucketName = '6190e8c5-mirrorday';
const region = 'ru-RU'; // Регион вашего S3
const accessKeyId = 'RYDN9J1RC8AYOSQUBOM1';
const secretAccessKey = 'J0F24GQaX6jxESJT9cdEz667LXk9FwqgJZsm9sEd';
const s3Host = `s3.timeweb.cloud`;

// Функция для создания подписи
function sign(key: Buffer, msg: string): Buffer {
	return crypto.createHmac('sha256', key).update(msg).digest();
}

export function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
	const kDate = sign(Buffer.from(`AWS4${key}`, 'utf-8'), dateStamp);
	const kRegion = sign(kDate, regionName);
	const kService = sign(kRegion, serviceName);
	const kSigning = sign(kService, 'aws4_request');
	return kSigning;
}

// Функция для загрузки файла
export async function uploadFile(fileContent: string, fileName: string) {
	const date = new Date();
	const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '') + 'Z'; // Формат даты для заголовка
	const dateStamp = date.toISOString().slice(0, 10).replace(/-/g, ''); // Формат даты для использования в подписи

	const method = 'PUT';
	const service = 's3';
	const canonicalUri = `/${bucketName}/${fileName}`;
	const host = `${bucketName}.s3.${region}.amazonaws.com`;

	const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
	const payloadHash = crypto.createHash('sha256').update(fileContent).digest('hex');

	const canonicalRequest = [
		method,
		canonicalUri,
		'',
		`host:${host}`,
		`x-amz-content-sha256:${payloadHash}`,
		`x-amz-date:${amzDate}`,
		'',
		signedHeaders,
		payloadHash
	].join('\n');

	const algorithm = 'AWS4-HMAC-SHA256';
	const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
	const stringToSign = [
		algorithm,
		amzDate,
		credentialScope,
		crypto.createHash('sha256').update(canonicalRequest).digest('hex')
	].join('\n');

	const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
	const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

	const authorizationHeader = [
		`${algorithm} Credential=${accessKeyId}/${credentialScope}`,
		`SignedHeaders=${signedHeaders}`,
		`Signature=${signature}`
	].join(', ');

	const options = {
		hostname: host,
		path: `/${fileName}`,
		method: 'PUT',
		headers: {
			'Content-Type': 'application/octet-stream',
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate,
			'Authorization': authorizationHeader,
			'Content-Length': `${fileContent.length}`
		}
	};


	const param: RequestUrlParam = {
		body: fileContent,
		headers: options.headers,
		method: method,
		url: `https://${host}${options.path}`,
		contentType: 'application/octet-stream',
	};

	// return await requestUrl(param)


	return new Promise<void>((resolve, reject) => {
		const req = https.request(options, (res) => {
			if (res.statusCode === 200) {
				console.log('File uploaded successfully');
				resolve();
			} else {
				console.error(`Failed to upload file. Status code: ${res.statusCode}`);
				res.on('data', (d) => process.stdout.write(d));
				reject(new Error(`Failed to upload file. Status code: ${res.statusCode}`));
			}
		});

		req.on('error', (e) => {
			console.error(`Problem with request: ${e.message}`);
			reject(e);
		});

		// Отправляем файл
		req.write(fileContent);
		req.end();
	});
}


