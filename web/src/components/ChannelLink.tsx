import React from 'react';
import Youtube from './Youtube';
import Twitch from './Twitch';

interface ChannelLinkProps {
    url: string;
}

const ChannelLink: React.FC<ChannelLinkProps> = ({ url }) => {

    const getChannelName = (url: string): string => {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/');
        return pathSegments[pathSegments.length - 1];
    };

    return (<>
        {url.includes('youtube.com') && <a href={url} target="_blank" rel="noopener"><Youtube width="30" height="30" style={{ verticalAlign: "middle", margin: '0 0.3rem' }} /><span>{getChannelName(url)}</span></a>}
        {url.includes('twitch.tv') && <a href={url} target="_blank" rel="noopener"><Twitch width="30" height="30" style={{ verticalAlign: "middle", margin: '0 0.3rem' }} /><span>{getChannelName(url)}</span></a>}
    </>);
};

export default ChannelLink;