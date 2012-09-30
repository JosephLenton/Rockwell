
cmd = 'node "' + File.dirname(__FILE__) + '\src\main.js"'

instructions = {
        'exit' => Proc.new { exit },
        'halt' => Proc.new { exit },
        'quit' => Proc.new { exit }
}

# Actual Program

puts 'Rockwell server started ...'
puts " running ${cmd}"
puts
puts ' - type \'quit\' to end'
puts ' - hit enter to restart'

running = false
while true
    if not running
        running = true

        puts
        puts ' ... starting node ... '
        puts '-----------------------'

        t = Thread.new do
            IO.popen( cmd ) do |node|
                node.each { |line| puts line }
            end
        end

        sleep 1
    end

    puts
    print '> '
    instruction = gets.chomp

    if instruction == ''
        t.exit
        `taskkill /im "node.exe" /f >nul 2>&1`
        running = false
    else
        if instructions.include? instruction
            instructions[instruction].call()
        else
            puts 'unknown command'
        end
    end
end

