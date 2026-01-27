Write-Host "🚀 Deploying platform service fix..." -ForegroundColor Green

# Build the service
Write-Host "📦 Building platform service..." -ForegroundColor Yellow
Set-Location services/platform-service
npm run build

Write-Host "✅ Build completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps to complete deployment:" -ForegroundColor Cyan
Write-Host "1. Copy the built files to your server" -ForegroundColor White
Write-Host "2. Run: npm install --production" -ForegroundColor White  
Write-Host "3. Run: npm run prisma:generate" -ForegroundColor White
Write-Host "4. Run: pm2 restart platform-service" -ForegroundColor White
Write-Host ""
Write-Host "Or use the restart script: ./restart-production.sh" -ForegroundColor Yellow