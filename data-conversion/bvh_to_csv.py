import numpy as np

def find_line(lines, prefix):
  for line in lines:
    if line.startswith('Frames:'):
      return line

def read_bvh_file(file_path):
    # Read file contents
    with open(file_path, 'r') as f:
        file_contents = f.read()
        
    # Split file contents by newline characters
    lines = file_contents.split('\n')

    # Find the channel names
    channel_names = []
    joint_name = None
    for line in lines:
      line = line.strip()
      if line.startswith('JOINT') or line.startswith('ROOT'):
        # Joint line looks like this:
        # JOINT Spine2
        joint_data = line.split(' ')
        joint_name = joint_data[1]
      if line.startswith('CHANNELS'):
        # Channels line looks like this:
        # CHANNELS 3 Yrotation Xrotation Zrotation
        channel_data = line.split(' ')
        for channel in channel_data[2:]:
          channel_names.append(f'{joint_name}_{channel}')
    
    # Find the number of frames and the start of the motion data
    num_frames_line = find_line(lines, 'Frames:')
    num_frames = int(num_frames_line.split(' ')[1])
    motion_data_index = lines.index('MOTION') + 3
    header = '\n'.join(lines[:motion_data_index])
    
    # Find the number of channels in the file
    first_frame_data = lines[motion_data_index].strip().split(' ')
    num_channels = len(first_frame_data)
    print('Channels:', num_channels)

    # Extract the motion data as a string
    motion_data_str = ''.join(lines[motion_data_index:motion_data_index+num_frames])
    
    # Convert the motion data to a numpy array
    motion_data = np.fromstring(motion_data_str, sep=' ')
    motion_data = motion_data.reshape((num_frames, -1))

    # Convert the numpy array to float32 values
    motion_data = motion_data.astype(np.float32)
    
    return motion_data, header, channel_names      

# Save the data back to CSV format
# np.savetxt('flute2.csv', raw_data, delimiter=',', header=','.join(channel_names), comments='', fmt='%.5f')

def parse_and_convert(bvh_file, csv_file):
    raw_data, header, channel_names = read_bvh_file(bvh_file)
    np.savetxt(csv_file, raw_data, delimiter=',', header=','.join(channel_names), comments='', fmt='%.5f')

if __name__=='__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('bvh_file', type=str)
    parser.add_argument('csv_file', type=str)
    args = parser.parse_args()
    parse_and_convert(args.bvh_file, args.csv_file)

