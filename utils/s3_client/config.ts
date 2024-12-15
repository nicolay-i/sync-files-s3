export interface S3Config {
	s3Endpoint: string;
	s3Region: string;
	s3AccessKeyID: string;
	s3SecretAccessKey: string;
	s3BucketName: string;

	partsConcurrency?: number;
	forcePathStyle?: boolean;
	remotePrefix?: string;

	useAccurateMTime?: boolean;
	reverseProxyNoSignUrl?: string;

	generateFolderObject?: boolean;

	/**
	 * @deprecated
	 */
	bypassCorsLocally?: boolean;
}

export let minioConfig = {
	endpoint: '',
	accessKey: '',
	secretKey: '',
	bucketName: '',
	region: '',
	password_e2e: '',
};
