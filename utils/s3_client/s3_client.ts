import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import {Vault} from "obsidian";
import {VALID_REQURL} from "./baseTypesObs";
import {Readable} from "stream";
import {minioConfig, S3Config} from "./config";
import {ObsHttpHandler} from "./ObsHttpHandler";
import {SyncFileConfigFile} from "../sync_config";
import {_app} from "../../syncFile";

const getS3Client = (s3Config: S3Config) => {
	let endpoint = s3Config.s3Endpoint;
	if (!(endpoint.startsWith("http://") || endpoint.startsWith("https://"))) {
		endpoint = `https://${endpoint}`;
	}

	let s3Client: S3Client;
	if (VALID_REQURL && s3Config.bypassCorsLocally) {
		s3Client = new S3Client({
			region: s3Config.s3Region,
			endpoint: endpoint,
			forcePathStyle: s3Config.forcePathStyle,
			credentials: {
				accessKeyId: s3Config.s3AccessKeyID,
				secretAccessKey: s3Config.s3SecretAccessKey,
			},
			requestHandler: new ObsHttpHandler(
				undefined,
				s3Config.reverseProxyNoSignUrl
			),
		});
	} else {
		s3Client = new S3Client({
			region: s3Config.s3Region,
			endpoint: endpoint,
			forcePathStyle: s3Config.forcePathStyle,
			credentials: {
				accessKeyId: s3Config.s3AccessKeyID,
				secretAccessKey: s3Config.s3SecretAccessKey,
			},
		});
	}

	s3Client.middlewareStack.add(
		(next, context) => (args) => {
			(args.request as any).headers["cache-control"] = "no-cache";
			return next(args);
		},
		{
			step: "build",
		}
	);

	return s3Client;
};


export async function getFilesList() {
	const clint = getS3Client({
		s3Endpoint: minioConfig.endpoint,
		s3Region: "ru-RU",
		s3AccessKeyID: minioConfig.accessKey,
		s3SecretAccessKey: minioConfig.secretKey,
		s3BucketName: minioConfig.bucketName,
		bypassCorsLocally: true,
	})

	const res = await clint.send(new ListObjectsV2Command({
		Bucket: minioConfig.bucketName
	}))

	console.log(res);

	return res;
}

export async function downloadFile(remotePath: string, localPath: string, vault: Vault, fileInfo?: SyncFileConfigFile) {
	const clint = getS3Client({
		s3Endpoint: minioConfig.endpoint,
		s3Region: "ru-RU",
		s3AccessKeyID: minioConfig.accessKey,
		s3SecretAccessKey: minioConfig.secretKey,
		s3BucketName: minioConfig.bucketName,
		bypassCorsLocally: true,
	})

	const res = await clint.send(new GetObjectCommand({
		Bucket: minioConfig.bucketName,
		Key: remotePath
	}))

	console.log({res})

	const file = await res.Body?.transformToByteArray()

	const fileArrayBuffer: ArrayBuffer = new ArrayBuffer(file?.byteLength || 0);
	const fileUint8Array = new Uint8Array(fileArrayBuffer);
	fileUint8Array.set(file as Uint8Array);

	await vault.adapter.mkdir(`${localPath.split('/').slice(0, -1).join('/')}`);
	await vault.adapter.writeBinary(localPath, fileUint8Array, fileInfo?.meta ? {ctime: fileInfo.meta.ctime, mtime: fileInfo.meta.mtime} : undefined);

	console.log(`File ${remotePath} saved in ${localPath}`)
}

export async function uploadFile(localPath: string, remotePath: string, vault: Vault) {
	const clint = getS3Client({
		s3Endpoint: minioConfig.endpoint,
		s3Region: "ru-RU",
		s3AccessKeyID: minioConfig.accessKey,
		s3SecretAccessKey: minioConfig.secretKey,
		s3BucketName: minioConfig.bucketName,
		bypassCorsLocally: true,
	})

	const cachedFile =  _app.vault.getFileByPath(localPath);
	const file = await vault.adapter.readBinary(localPath);
	const uint8Array = new Uint8Array(file);

	await clint.send(new PutObjectCommand({
		Bucket: minioConfig.bucketName,
		Key: remotePath,
		Body: uint8Array,
		ContentType: "application/octet-stream",
		Metadata: {
			"hash": `${cachedFile?.stat?.size}-${cachedFile?.stat?.mtime}`,
		}
	}))

	console.log(`Uploaded ${localPath} to ${minioConfig.bucketName} in ${remotePath}`)
}

export function deleteFile(remotePath: string) {

	const clint = getS3Client({
		s3Endpoint: minioConfig.endpoint,
		s3Region: "ru-RU",
		s3AccessKeyID: minioConfig.accessKey,
		s3SecretAccessKey: minioConfig.secretKey,
		s3BucketName: minioConfig.bucketName,
		bypassCorsLocally: true,
	})

	return clint.send(new DeleteObjectCommand({
		Bucket: minioConfig.bucketName,
		Key: remotePath
	}))

}

export async function moveFile(localPath: string, remotePath: string, vault: Vault, oldRemotePath: string) {
	await uploadFile(localPath, remotePath, vault)
	await deleteFile(oldRemotePath)
}
