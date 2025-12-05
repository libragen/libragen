import { useEffect } from 'react';

export function SpeedInsights() {
	useEffect(() => {
		// Dynamically import Speed Insights on client side
		import('@vercel/speed-insights').then((module) => {
			module.inject();
		});
	}, []);

	return null;
}
