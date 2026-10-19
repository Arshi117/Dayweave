param(
    [Parameter(Mandatory = $true)][long]$WindowHandle,
    [Parameter(Mandatory = $true)][uint32]$OwnerProcessId,
    [Parameter(Mandatory = $true)][string]$SourcePath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$desktopHost = $null
function Send-Reply($reply) {
    [Console]::Out.WriteLine(($reply | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}
try {
    Add-Type -Path $SourcePath
    $desktopHost = [Dayweave.Native.DesktopHost]::new($WindowHandle, $OwnerProcessId)
    Send-Reply @{ id = 0; ok = $true }
    while ($null -ne ($requestLine = [Console]::ReadLine())) {
        $request = $null
        try {
            $request = $requestLine | ConvertFrom-Json
            $result = $null
            switch ($request.command) {
                'attach' { $result = $desktopHost.Attach([int]$request.x, [int]$request.y, [int]$request.width, [int]$request.height) }
                'attach-control' { $desktopHost.AttachControl([long]$request.handle, [int]$request.x, [int]$request.y, [int]$request.width, [int]$request.height) }
                'resize-control' { $desktopHost.ResizeControl([int]$request.x, [int]$request.y, [int]$request.width, [int]$request.height) }
                'resize' { $desktopHost.Resize([int]$request.x, [int]$request.y, [int]$request.width, [int]$request.height) }
                'visible' { $desktopHost.SetVisible([bool]$request.visible) }
                'status' { $result = $desktopHost.Refresh() }
                default { throw 'Unknown desktop command.' }
            }
            Send-Reply @{ id = $request.id; ok = $true; result = $result }
        } catch {
            Send-Reply @{ id = $request.id; ok = $false; error = $_.Exception.Message }
        }
    }
} catch {
    Send-Reply @{ id = 0; ok = $false; error = $_.Exception.Message }
    exit 1
} finally {
    if ($null -ne $desktopHost) { $desktopHost.Dispose() }
}
