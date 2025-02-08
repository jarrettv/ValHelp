import type { SVGProps } from 'react';

export default function Watch(props: SVGProps<SVGSVGElement>) {
	return (<svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 48 48" {...props}><defs><mask id="ipTVideo0"><g fill="none" stroke="#fff" strokeLinejoin="round" strokeWidth={4}><path fill="#555555" d="M4 10a2 2 0 0 1 2-2h36a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"></path><path strokeLinecap="round" d="M36 8v32M12 8v32m26-22h6m-6 12h6M4 18h6m-6-2v4M9 8h6M9 40h6M33 8h6m-6 32h6M4 30h6m-6-2v4m40-4v4m0-16v4"></path><path fill="#555555" d="m21 19l8 5l-8 5z"></path></g></mask></defs><path fill="currentColor" d="M0 0h48v48H0z" mask="url(#ipTVideo0)"></path></svg>);
}