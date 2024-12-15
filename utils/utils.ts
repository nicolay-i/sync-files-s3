export async function delay(wait: number) {
	return new Promise(resolve => setTimeout(resolve, wait));
}
