#!/bin/bash
# Simulate 3 players sending track/log data for event 88 (seed huntR4EEQ4)
# Player 1: jv (126084695824924673) - heads northeast
# Player 2: oathorse (618218180929650698) - heads southwest
# Player 3: sobewan (562109692822683679) - heads southeast

API="http://localhost:5556"
SEED="huntR4EEQ4"
P1="126084695824924673"
P2="618218180929650698"
P3="562109692822683679"

send_log() {
  curl -s -X POST "$API/api/track/log" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$1\",\"seed\":\"$SEED\",\"score\":$2,\"code\":\"$3\"}" > /dev/null
}

send_logs() {
  curl -s -X POST "$API/api/track/logs" \
    -H "Content-Type: application/json" \
    -d "$1" > /dev/null
}

echo "=== Phase 1: Initial paths (spawn area) ==="
send_logs "{\"id\":\"$P1\",\"user\":\"jv\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":0,\"logs\":[{\"code\":\"Path=0:0,30,0;8:15,30,20;16:35,31,45;24:60,31,70\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P2\",\"user\":\"oathorse\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":0,\"logs\":[{\"code\":\"Path=0:0,30,0;8:-20,30,-15;16:-45,31,-35;24:-70,30,-60\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P3\",\"user\":\"sobewan\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":0,\"logs\":[{\"code\":\"Path=0:0,30,0;8:25,30,-10;16:50,31,-30;24:80,30,-55\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
echo " sent initial paths"
sleep 3

echo "=== Phase 2: First trophies (Meadows) ==="
send_log "$P1" 20 "TrophyBoar@120,32,140"
send_log "$P2" 30 "TrophyDeer@-150,31,-120"
send_log "$P3" 20 "TrophyNeck@160,30,-100"
echo " P1: Boar, P2: Deer, P3: Neck"

# More path movement
send_logs "{\"id\":\"$P1\",\"user\":\"jv\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":20,\"logs\":[{\"code\":\"Path=32:90,31,100;40:120,32,140;48:160,33,180;56:200,32,220\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P2\",\"user\":\"oathorse\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":30,\"logs\":[{\"code\":\"Path=32:-100,30,-90;40:-150,31,-120;48:-200,31,-160;56:-250,30,-200\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P3\",\"user\":\"sobewan\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":20,\"logs\":[{\"code\":\"Path=32:110,30,-75;40:160,30,-100;48:210,31,-130;56:260,30,-160\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
sleep 3

echo "=== Phase 3: More trophies + Eikthyr ==="
send_log "$P1" 50 "TrophyDeer@250,32,280"
send_log "$P1" 100 "TrophyEikthyr@350,35,350"
send_log "$P2" 60 "TrophyBoar@-300,30,-250"
send_log "$P2" 80 "TrophyNeck@-380,29,-320"
send_log "$P3" 50 "TrophyBoar@320,31,-200"
send_log "$P3" 80 "TrophyDeer@400,32,-260"
echo " P1: Deer+Eikthyr, P2: Boar+Neck, P3: Boar+Deer"

send_logs "{\"id\":\"$P1\",\"user\":\"jv\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":100,\"logs\":[{\"code\":\"Path=64:240,32,260;72:280,33,300;80:320,34,330;88:350,35,350\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P2\",\"user\":\"oathorse\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":80,\"logs\":[{\"code\":\"Path=64:-290,30,-240;72:-330,29,-280;80:-360,29,-300;88:-380,29,-320\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P3\",\"user\":\"sobewan\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":80,\"logs\":[{\"code\":\"Path=64:300,31,-190;72:340,31,-220;80:380,32,-245;88:400,32,-260\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
sleep 3

echo "=== Phase 4: P1 completes Meadows biome bonus ==="
send_log "$P1" 130 "TrophyNeck@400,30,400"
send_log "$P1" 280 "TrophyNeck|BonusMeadows@400,30,400"
echo " P1: Neck + BonusMeadows (gold stroke!)"

send_logs "{\"id\":\"$P1\",\"user\":\"jv\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":280,\"logs\":[{\"code\":\"Path=96:380,34,370;104:400,33,390;112:400,30,400;120:420,31,420\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
sleep 3

echo "=== Phase 5: P2 death + P3 into Black Forest ==="
send_log "$P2" 30 "PenaltyDeath@-420,28,-380"
send_log "$P3" 110 "TrophyGreydwarf@500,33,-320"
send_log "$P3" 140 "TrophySkeleton@600,34,-380"
echo " P2: DEATH, P3: Greydwarf+Skeleton"

send_logs "{\"id\":\"$P2\",\"user\":\"oathorse\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":30,\"logs\":[{\"code\":\"Path=96:-400,29,-350;104:-420,28,-380;112:-400,29,-360;120:-380,30,-340\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P3\",\"user\":\"sobewan\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":140,\"logs\":[{\"code\":\"Path=96:440,32,-280;104:480,33,-310;112:540,33,-350;120:600,34,-380\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
sleep 3

echo "=== Phase 6: Continued exploration ==="
send_logs "{\"id\":\"$P1\",\"user\":\"jv\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":280,\"logs\":[{\"code\":\"Path=128:450,31,440;136:500,32,460;144:550,33,470;152:600,34,480\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P2\",\"user\":\"oathorse\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":30,\"logs\":[{\"code\":\"Path=128:-360,30,-320;136:-340,31,-290;144:-310,31,-260;152:-280,32,-230\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"
send_logs "{\"id\":\"$P3\",\"user\":\"sobewan\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":140,\"logs\":[{\"code\":\"Path=128:650,34,-400;136:700,35,-430;144:750,35,-450;152:800,36,-470\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"

send_log "$P1" 310 "TrophyGreydwarf@600,34,480"
send_log "$P2" 60 "TrophyEikthyr@-280,32,-230"
echo " P1: Greydwarf, P2: Eikthyr"
sleep 3

echo "=== Phase 7: P3 gets FrostTroll + completes Black Forest ==="
send_log "$P3" 200 "TrophyFrostTroll@850,38,-500"
send_log "$P3" 220 "TrophyGreydwarfBrute@900,37,-530"
send_log "$P3" 250 "TrophyGreydwarfShaman@950,36,-550"
send_log "$P3" 500 "TrophyGreydwarfShaman|BonusForest@950,36,-550"
echo " P3: FrostTroll + Brute + Shaman + BonusForest (gold!)"

send_logs "{\"id\":\"$P3\",\"user\":\"sobewan\",\"seed\":\"$SEED\",\"mode\":\"TrophyHunt\",\"score\":500,\"logs\":[{\"code\":\"Path=160:830,37,-485;168:860,38,-500;176:900,37,-530;184:950,36,-550\",\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)Z\"}]}"

echo ""
echo "=== Simulation complete ==="
echo "Open http://localhost:5173/events/88 and click the Map tab"
