Set-Location "D:\AI Coding\IELTS"
$log = "D:\AI Coding\IELTS\data\dictation-prepare.log"
& "C:\Program Files\nodejs\npx.cmd" tsx scripts/prepare-daily-dictation.ts >> $log 2>&1
