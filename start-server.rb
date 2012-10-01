
cmd = 'node "' + File.dirname(__FILE__) + '\src\main.js"'

instructions = {
        'exit' => Proc.new { killNode; exit },
        'halt' => Proc.new { killNode; exit },
        'quit' => Proc.new { killNode; exit },

        'build' => Proc.new { `build_quby.bat` },

        'script' => Proc.new { |commands, scriptName| system(scriptName) }
}

$running = false

def killNode()
    if $running
        `taskkill /im "node.exe" /f >nul 2>&1`
        $running = false
    end
end

# Actual Program

puts 'Rockwell server started ...'
puts " running ${cmd}"
puts
puts ' - type \'quit\' to end'
puts ' - hit enter to restart'

while true
    if not $running
        $running = true

        puts
        puts ' ... starting node ... '
        puts '-----------------------'

        t = Thread.new do
            obj = IO.popen( cmd ) do |node|
                node.each { |line| puts line }
            end
        end

        sleep 1
    end

    puts
    print '> '

    commands    = gets.chomp.split( ' ' )
    instruction = commands[0]

    if !instructions.include?( instruction ) && !instruction.nil?
        puts 'unknown command'
    else
        if instruction.nil?
            killNode
        else
            instructions[instruction].call( commands )
        end
    end
end

