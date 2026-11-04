# Goal

Track player progress thru a world and view the path thru the world without exposing undiscovered areas that may spoil the playthrough. World map should only show what is uncovered by the character file so we replicate the fog-of-war system the game uses.

There are three options for tracking:

1. Server-mod based
   1. Run a mod on the server
   2. Real-time character and pathing info
   3. Cross-play compatible
   4. No client setup needed
1. Client-mod based
   1. User installs mod
   2. User logs in website
   3. Real-time character and pathing info
1. Local file based
   1. No mod needed
   2. User installs a file watcher
   3. Updates are periodic
   4. Great for tracking a speedrun

## Consider

- Use our existing trophy hunt event tracking as inspiration but do more detailed character progress tracking
- When discovering a trader, all other trader locations get "grayed-out" since you can only discover one location per trader type
- Support multiple players per world, similar to trophy event tracking, but in this case it would be same world instance
- Import player markers they put on their map
- Allow a spoiler mode for spectators that want to see the full world that removes "fog-of-war"
- Spoiler warning only if the logged in player has active character in the world
- Check our existing database and reconcile anything we built for this in the past
- Compliment our existing world screen or consider a new screen that just has the player tracking features over the world map
- I love the scrollbar mechanic from our event viewer but there is no finite timeline for tracking a character in a world
- When I play a world, I may do many play sessions over many days so the tracking system should take this into account
- Sometimes I logout and login to save myself from dying, this isn't really considered a separate session if it happens rapidly